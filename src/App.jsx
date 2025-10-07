import React, { useState } from 'react'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export default function App() {
  // Auth
  const [email, setEmail] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [token, setToken] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Optional org
  const [orgId, setOrgId] = useState('')

  // Visuals (server fetch 50 + client pagination 10)
  const [visuals, setVisuals] = useState([])
  const [gender, setGender] = useState('') // '', 'MALE', 'FEMALE'
  const CLIENT_PAGE_SIZE = 10
  const [clientPage, setClientPage] = useState(1)

  // Voices (ElevenLabs only)
  const [voices, setVoices] = useState([])
  const [voice, setVoice] = useState('') // voiceId
  const [voicesLoading, setVoicesLoading] = useState(false)

  // Create flow
  const [selectedVisual, setSelectedVisual] = useState('')
  const [alias, setAlias] = useState('')
  const [headId, setHeadId] = useState('')
  const [streamUrl, setStreamUrl] = useState('')

  // Generic UI
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function api(path, { method = 'GET', body } = {}) {
    const url = `https://platform-api.unith.ai${path}`
    const res = await fetch(url, {
      method,
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status} — ${text}`)
    }
    return res.json()
  }

  // AUTH
  async function getToken() {
    setAuthError(''); setError(''); setAuthLoading(true)
    try {
      if (!email || !secretKey) throw new Error('Please enter email and secret key.')
      const data = await api('/auth/token', { method: 'POST', body: { email, secretKey } })
      const newToken = data?.token || data?.data?.bearer
      if (!newToken) throw new Error('No token returned. Check credentials.')
      setToken(newToken)

      // Load initial datasets after auth
      await loadVisuals()
      await loadVoices()
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setAuthLoading(false)
    }
  }

  // VISUALS: fetch 50 from server (optionally filtered by gender), then paginate client-side (10/page)
  async function loadVisuals() {
    if (!token) return
    setError(''); setLoading(true)
    try {
      const params = new URLSearchParams({
        order: 'ASC',
        page: '1',
        take: '50',
        _: String(Date.now()), // cache-buster
      })
      if (gender) params.set('gender', gender)

      const resp = await api(`/head_visual/face/all?${params.toString()}`)
      const items = Array.isArray(resp?.data) ? resp.data : []
      setVisuals(items)
      setClientPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // VOICES (ElevenLabs only)
  async function loadVoices() {
    if (!token) return
    setVoicesLoading(true); setError('')
    try {
      const resp = await api(`/voice/all?provider=elevenlabs&take=200`)
      const rawCandidates =
        resp?.data?.voices ??
        resp?.data?.items ??
        resp?.voices ??
        (Array.isArray(resp?.data) ? resp.data : undefined) ??
        (Array.isArray(resp) ? resp : []) ??
        []

      const list = rawCandidates
        .map(v => ({
          voiceId: v.voiceId || v.voice_id || v.id || v.ttsVoice || '',
          displayName: v.displayName || v.name || v.ttsVoice || v.voiceId || v.id || '',
          locale: v.locale || v.languageCode || '',
          language: v.language || '',
          gender: v.gender || '',
        }))
        .filter(v => v.voiceId && v.displayName)

      setVoices(list)
      if (!voice && list.length) setVoice(list[0].voiceId)
    } catch (e) {
      setError(e.message)
    } finally {
      setVoicesLoading(false)
    }
  }

  function bestThumb(v) {
    return v?.avatar || v?.posterImage || v?.videoUrl || ''
  }

  // CREATE
  async function createHead() {
    if (!selectedVisual || !alias) return
    setError(''); setLoading(true); setStreamUrl(''); setHeadId('')
    try {
      const body = {
        headVisualId: selectedVisual,
        alias,
        name: alias,
        languageSpeechRecognition: 'en-US',
        language: 'en-US',
        operationMode: 'oc',
        ttsProvider: 'elevenlabs',
        ttsVoice: voice,       // IMPORTANT: pass the voiceId
        greetings: '',
        ...(orgId ? { orgId } : {}),
      }
      const created = await api('/head/create', { method: 'POST', body })
      const newHeadId = created?.id || created?.publicId || created?.headId
      if (!newHeadId) throw new Error('Head ID not returned.')
      setHeadId(newHeadId)

      // Disable splitter (required for streaming)
      await api(`/head/${newHeadId}/splitter?splitter=false`, { method: 'PUT' })

      // Read details to compute streaming URL
      const details = await api(`/head/${newHeadId}`)
      const publicUrl = details?.publicUrl || created?.publicUrl || ''
      if (publicUrl) {
        const u = new URL(publicUrl)
        const parts = u.pathname.split('/').filter(Boolean) // [orgId, headId]
        const org = parts[0]
        const head = parts[1]
        const apiKey = u.searchParams.get('api_key')
        if (org && head && apiKey) {
          setStreamUrl(`https://stream.unith.ai/${org}/${head}?api_key=${apiKey}`)
        }
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Client-side pagination slice
  const start = (clientPage - 1) * CLIENT_PAGE_SIZE
  const end = start + CLIENT_PAGE_SIZE
  const pageItems = visuals.slice(start, end)
  const clientPageCount = Math.max(1, Math.ceil(visuals.length / CLIENT_PAGE_SIZE))

  // --- RENDER ---
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-3xl font-bold">Unith Streaming Avatar Creator</h1>
      <p className="text-gray-600 mt-1">Create a streaming-ready Digital Human using your Unith account.</p>

      {/* Auth + Visuals cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {/* Auth */}
        <div className="rounded-2xl bg-white shadow p-4 space-y-3">
          <h2 className="font-semibold">1) Authenticate</h2>
          <Field label="Email">
            <input className="w-full border rounded p-2" placeholder="you@company.com" onChange={e=>setEmail(e.target.value)} />
          </Field>
          <Field label="Secret Key">
            <input type="password" className="w-full border rounded p-2" placeholder="sk_live_xxx (never stored)" onChange={e=>setSecretKey(e.target.value)} />
          </Field>
          <button disabled={authLoading} onClick={getToken} className="w-full rounded-xl bg-blue-600 text-white py-2 hover:bg-blue-700 disabled:opacity-50">
            {authLoading ? 'Authenticating…' : 'Get Token'}
          </button>
          <p className="text-xs text-gray-500">Token is valid for 7 days.</p>
          {authError && <div className="p-2 rounded bg-red-50 text-red-700 text-sm">{authError}</div>}
          {token && <p className="text-green-700 text-sm break-all">Token acquired ✔️</p>}
        </div>

        {/* Visuals */}
        <div className="rounded-2xl bg-white shadow p-4 space-y-3">
          <h2 className="font-semibold">2) Pick a Head Visual</h2>
          <Field label="(Optional) orgId for multi-org accounts">
            <input className="w-full border rounded p-2" placeholder="affc40ed-..." onChange={e=>setOrgId(e.target.value)} />
          </Field>

          <Field label="Gender">
            <select
              className="w-full border rounded p-2"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="">All</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
          </Field>

          {token ? (
            <div className="flex items-center gap-2">
              <button
                disabled={loading}
                onClick={()=>loadVisuals()}
                className="rounded-xl bg-emerald-600 text-white py-2 px-4 hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading && visuals.length===0 ? 'Loading…' : (visuals.length ? 'Reload Visuals' : 'Load Head Visuals')}
              </button>
              <span className="text-xs text-gray-500">Fetches 50; shows 10 per page</span>
            </div>
          ) : <p className="text-sm text-gray-500">Authenticate first to load visuals.</p>}

          {visuals.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
                {pageItems.map(v => (
                  <button
                    key={v.id}
                    onClick={()=>setSelectedVisual(v.id)}
                    className={`rounded-xl overflow-hidden border ${selectedVisual===v.id ? 'border-blue-600 ring-4 ring-blue-100' : 'border-gray-200'} hover:shadow`}
                  >
                    <div className="aspect-[4/5] bg-gray-100 overflow-hidden">
                      <img src={bestThumb(v)} alt={v.name} className="w-full h-full object-cover"/>
                    </div>
                    <div className="p-2 text-left">
                      <div className="font-medium text-sm">{v.name}</div>
                      <div className="text-xs text-gray-500">{v.gender}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Client-side pagination controls */}
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-gray-500">
                  Page {clientPage} of {clientPageCount} · {visuals.length} total
                </div>
                <div className="space-x-2">
                  <button
                    disabled={clientPage <= 1}
                    onClick={() => setClientPage(p => Math.max(1, p - 1))}
                    className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Prev
                  </button>
                  <button
                    disabled={clientPage >= clientPageCount}
                    onClick={() => setClientPage(p => Math.min(clientPageCount, p + 1))}
                    className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create card */}
      <div className="mt-6 rounded-2xl bg-white shadow p-4 space-y-3">
        <h2 className="font-semibold">3) Create Streaming Avatar</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Alias / Name">
            <input className="w-full border rounded p-2" placeholder="My Assistant" onChange={e=>setAlias(e.target.value)} />
          </Field>

          <Field label="TTS Voice (ElevenLabs)">
            {voices.length > 0 ? (
              <select className="w-full border rounded p-2" value={voice} onChange={e=>setVoice(e.target.value)}>
                {voices.map(v => (
                  <option key={v.voiceId} value={v.voiceId}>
                    {v.displayName}{v.locale ? ` (${v.locale})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full border rounded p-2"
                  placeholder="Paste ElevenLabs voiceId (fallback)"
                  value={voice}
                  onChange={e=>setVoice(e.target.value)}
                />
                <button
                  type="button"
                  onClick={loadVoices}
                  className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                >
                  Retry Load Voices
                </button>
              </div>
            )}
            {voicesLoading && <div className="text-xs text-gray-500 mt-1">Loading voices…</div>}
          </Field>

          <div className="flex items-end">
            <button
              disabled={!selectedVisual || !alias || loading || !token || !voice}
              onClick={createHead}
              className="w-full rounded-xl bg-indigo-600 text-white py-2 hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Streaming Avatar'}
            </button>
          </div>
        </div>

        {error && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
        {headId && (
          <div className="text-sm text-gray-600">Head ID: <span className="font-mono">{headId}</span></div>
        )}
        {streamUrl ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <div className="font-semibold text-emerald-800">✅ Avatar created and streaming-ready!</div>
            <a className="text-emerald-700 underline break-all" href={streamUrl} target="_blank" rel="noreferrer">
              Open Streaming Digital Human
            </a>
            <div className="text-xs text-emerald-900 mt-1">Keep this URL safe; it includes your org API key. Make changes to this DH in app.unith.ai</div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">After creation, you’ll get a <code>stream.unith.ai/orgId/headId?api_key=...</code> link. After this, visit app.unith.ai to edit the prompt and make any other changes to this new Digital Human.</p>

        )}
      </div>

      <footer className="mt-8 text-xs text-gray-400">
        Built for Unith Platform API • This app performs client-side requests only.
      </footer>
    </div>
  )
}
