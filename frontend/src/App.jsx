import { useState, useEffect, useCallback, useRef } from 'react'
import Hls from 'hls.js'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

// Use environment variables for production, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

function App() {
  // Auth State - Database backed
  const [currentUser, setCurrentUser] = useState(null) // { id, username, credits, is_admin }
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('login') // 'login' or 'register'
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  
  // Cash In State
  const [showCashInModal, setShowCashInModal] = useState(false)
  const [cashInAmount, setCashInAmount] = useState('')
  const [cashInStep, setCashInStep] = useState(1) // 1: amount, 2: QR code
  const [cashInRequest, setCashInRequest] = useState(null)
  const [gcashSettings, setGcashSettings] = useState({ gcash_number: '', gcash_name: '' })
  const [pendingCashIns, setPendingCashIns] = useState([])
  
  // Admin GCash Settings
  const [showGcashSettingsModal, setShowGcashSettingsModal] = useState(false)
  const [editGcashNumber, setEditGcashNumber] = useState('')
  const [editGcashName, setEditGcashName] = useState('')
  
  // Admin Stream Cookie Settings
  const [showCookieModal, setShowCookieModal] = useState(false)
  const [cookieInput, setCookieInput] = useState('')
  const [cookieLoading, setCookieLoading] = useState(false)
  
  // Cash Out State
  const [showCashOutModal, setShowCashOutModal] = useState(false)
  const [cashOutAmount, setCashOutAmount] = useState('')
  const [cashOutGcashNumber, setCashOutGcashNumber] = useState('')
  const [cashOutGcashName, setCashOutGcashName] = useState('')
  const [cashOutRequest, setCashOutRequest] = useState(null)
  const [pendingCashOuts, setPendingCashOuts] = useState([])
  
  // Transaction History
  const [showTransactionsModal, setShowTransactionsModal] = useState(false)
  const [transactionTab, setTransactionTab] = useState('bets') // 'bets', 'cashin', 'cashout'
  const [betHistory, setBetHistory] = useState([])
  const [cashInHistory, setCashInHistory] = useState([])
  const [cashOutHistory, setCashOutHistory] = useState([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  
  // Computed - Role based access
  const userRole = currentUser?.role || 'user' // 'user', 'cashier', 'admin'
  const isAdmin = userRole === 'admin'
  const isCashier = userRole === 'cashier'
  const isStaff = isAdmin || isCashier // Either admin or cashier
  const userCredit = currentUser?.credits || 0
  const userName = currentUser?.username || ''
  
  // State
  const [connected, setConnected] = useState(false)
  const [fightNumber, setFightNumber] = useState(1)
  const [status, setStatus] = useState('waiting')
  const [bets, setBets] = useState([])
  const [history, setHistory] = useState([])
  const [streamDelay, setStreamDelay] = useState(5)
  const [lastCallTime, setLastCallTime] = useState(10)
  const [countdown, setCountdown] = useState(null)
  const [isBrowserRunning, setIsBrowserRunning] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loading, setLoading] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [winner, setWinner] = useState(null)
  
  // Stream URLs - uses the same base as API_URL
  const PROXY_STREAM_URL = `${API_URL}/stream/live.m3u8`
  const [streamUrl, setStreamUrl] = useState(null)
  const [proxyReady, setProxyReady] = useState(false)
  const [streamStatus, setStreamStatus] = useState('unknown')
  const [showStream, setShowStream] = useState(false)
  
  // Bet form
  const [betName, setBetName] = useState('')
  const [betAmount, setBetAmount] = useState('')
  
  // Live Audio State (from stream)
  const [audioMuted, setAudioMuted] = useState(true) // Start muted (autoplay policy)
  
  // Refs
  const wsRef = useRef(null)
  const countdownRef = useRef(null)
  const audioContextRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  
  // ===== AUTH FUNCTIONS =====
  const handleLogin = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Please enter username and password')
      return
    }
    
    setAuthLoading(true)
    setAuthError('')
    
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setCurrentUser(data.user)
        localStorage.setItem('sabong_user', JSON.stringify(data.user))
        setShowAuthModal(false)
        setAuthUsername('')
        setAuthPassword('')
      } else {
        setAuthError(data.detail || 'Login failed')
      }
    } catch (error) {
      setAuthError('Connection error. Please try again.')
    }
    
    setAuthLoading(false)
  }
  
  const handleRegister = async () => {
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError('Please enter username and password')
      return
    }
    
    if (authUsername.length < 3) {
      setAuthError('Username must be at least 3 characters')
      return
    }
    
    if (authPassword.length < 4) {
      setAuthError('Password must be at least 4 characters')
      return
    }
    
    setAuthLoading(true)
    setAuthError('')
    
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        setCurrentUser(data.user)
        localStorage.setItem('sabong_user', JSON.stringify(data.user))
        setShowAuthModal(false)
        setAuthUsername('')
        setAuthPassword('')
      } else {
        setAuthError(data.detail || 'Registration failed')
      }
    } catch (error) {
      setAuthError('Connection error. Please try again.')
    }
    
    setAuthLoading(false)
  }
  
  const handleLogout = () => {
    setCurrentUser(null)
    localStorage.removeItem('sabong_user')
  }
  
  // Refresh user data from server - ALWAYS get actual credits from database
  const refreshUserData = async () => {
    if (!currentUser?.id) return
    
    try {
      const response = await fetch(`${API_URL}/auth/user/${currentUser.id}`)
      if (response.ok) {
        const userData = await response.json()
        // Update with ACTUAL data from database
        const updatedUser = { ...currentUser, ...userData }
        setCurrentUser(updatedUser)
        localStorage.setItem('sabong_user', JSON.stringify(updatedUser))
        return updatedUser
      }
    } catch (error) {
      console.error('Failed to refresh user data:', error)
    }
    return null
  }
  
  // Get actual credits from database - use before any transaction
  const getActualCredits = async () => {
    if (!currentUser?.id) return 0
    
    try {
      const response = await fetch(`${API_URL}/auth/credits/${currentUser.id}`)
      if (response.ok) {
        const data = await response.json()
        return data.credits
      }
    } catch (error) {
      console.error('Failed to get credits:', error)
    }
    return 0
  }

  // Fetch all transaction history for user
  const fetchTransactionHistory = async () => {
    if (!currentUser?.id) return
    
    setLoadingTransactions(true)
    try {
      const response = await fetch(`${API_URL}/transactions/${currentUser.id}`)
      if (response.ok) {
        const data = await response.json()
        setBetHistory(data.bets || [])
        setCashInHistory(data.cashins || [])
        setCashOutHistory(data.cashouts || [])
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    }
    setLoadingTransactions(false)
  }

  // Open transactions modal and fetch history
  const openTransactionsModal = async () => {
    setShowTransactionsModal(true)
    await fetchTransactionHistory()
  }
  
  // Check for stored user session on load
  useEffect(() => {
    const storedUser = localStorage.getItem('sabong_user')
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser)
        setCurrentUser(user)
        // Immediately refresh user data from DATABASE
        setTimeout(() => {
          fetch(`${API_URL}/auth/user/${user.id}`)
            .then(r => r.json())
            .then(data => {
              if (data.id) {
                setCurrentUser(data)
                localStorage.setItem('sabong_user', JSON.stringify(data))
              }
            })
            .catch(() => {})
        }, 500)
      } catch (e) {
        localStorage.removeItem('sabong_user')
      }
    }
    
    // Load audio mute preference
    const savedAudioMuted = localStorage.getItem('sabong_audio_muted')
    if (savedAudioMuted !== null) {
      setAudioMuted(savedAudioMuted === 'true')
    }
  }, [])

  // Periodically refresh credits from database to prevent desync
  useEffect(() => {
    if (!currentUser?.id || isStaff) return
    
    // Refresh credits every 30 seconds
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/auth/credits/${currentUser.id}`)
        if (response.ok) {
          const data = await response.json()
          if (data.credits !== userCredit) {
            setCurrentUser(prev => ({ ...prev, credits: data.credits }))
            localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.credits }))
          }
        }
      } catch (e) {}
    }, 30000)
    
    return () => clearInterval(interval)
  }, [currentUser?.id, userCredit, isStaff])

  // Refresh credits when window regains focus (prevents inspect element cheating)
  useEffect(() => {
    if (!currentUser?.id || isStaff) return
    
    const handleFocus = async () => {
      try {
        const response = await fetch(`${API_URL}/auth/credits/${currentUser.id}`)
        if (response.ok) {
          const data = await response.json()
          setCurrentUser(prev => ({ ...prev, credits: data.credits }))
          localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.credits }))
        }
      } catch (e) {}
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [currentUser?.id, isStaff])

  // Sync audio mute state with video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = audioMuted
    }
    localStorage.setItem('sabong_audio_muted', audioMuted.toString())
  }, [audioMuted])

  const toggleAudio = () => {
    setAudioMuted(prev => !prev)
  }

  // Load GCash settings
  useEffect(() => {
    const loadGcashSettings = async () => {
      try {
        const response = await fetch(`${API_URL}/gcash/settings`)
        const data = await response.json()
        setGcashSettings(data)
        setEditGcashNumber(data.gcash_number)
        setEditGcashName(data.gcash_name)
      } catch (error) {
        console.error('Failed to load GCash settings:', error)
      }
    }
    loadGcashSettings()
  }, [])

  // Load pending cash-ins and cash-outs for admin and cashier
  useEffect(() => {
    if (isStaff) {
      const loadPendingTransactions = async () => {
        try {
          const [cashInRes, cashOutRes] = await Promise.all([
            fetch(`${API_URL}/cashin/pending`),
            fetch(`${API_URL}/cashout/pending`)
          ])
          const cashInData = await cashInRes.json()
          const cashOutData = await cashOutRes.json()
          setPendingCashIns(cashInData.requests || [])
          setPendingCashOuts(cashOutData.requests || [])
        } catch (error) {
          console.error('Failed to load pending transactions:', error)
        }
      }
      loadPendingTransactions()
      // Refresh every 30 seconds
      const interval = setInterval(loadPendingTransactions, 30000)
      return () => clearInterval(interval)
    }
  }, [isStaff])

  // Cash In Functions
  const openCashInModal = () => {
    if (!currentUser) {
      setShowAuthModal(true)
      return
    }
    setCashInStep(1)
    setCashInAmount('')
    setCashInRequest(null)
    setShowCashInModal(true)
  }

  const submitCashInRequest = async () => {
    const amount = parseInt(cashInAmount)
    if (!amount || amount < 100 || amount > 50000) {
      alert('Amount must be between ₱100 and ₱50,000')
      return
    }

    try {
      const response = await fetch(`${API_URL}/cashin/request?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      })
      const data = await response.json()
      
      if (data.success) {
        setCashInRequest(data.request)
        setCashInStep(2)
      } else {
        alert(data.detail || 'Failed to create request')
      }
    } catch (error) {
      alert('Connection error')
    }
  }

  const closeCashInModal = () => {
    setShowCashInModal(false)
    setCashInStep(1)
    setCashInAmount('')
    setCashInRequest(null)
  }

  // Admin: Set Stream Cookies Manually
  const submitStreamCookies = async () => {
    if (!cookieInput.trim()) {
      alert('Please paste cookies')
      return
    }
    
    setCookieLoading(true)
    try {
      const response = await fetch(`${API_URL}/stream/set-cookies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieInput })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        alert(`✅ ${data.message}\nStream proxy is ready!`)
        setProxyReady(true)
        setStreamUrl(PROXY_STREAM_URL)
        setShowStream(true)
        setShowCookieModal(false)
        setCookieInput('')
      } else {
        alert(data.detail || 'Failed to set cookies')
      }
    } catch (error) {
      alert('Connection error')
    }
    setCookieLoading(false)
  }

  // Admin: Update GCash Settings
  const updateGcashSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/gcash/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gcash_number: editGcashNumber,
          gcash_name: editGcashName
        })
      })
      const data = await response.json()
      
      if (data.success) {
        setGcashSettings({ gcash_number: editGcashNumber, gcash_name: editGcashName })
        setShowGcashSettingsModal(false)
        alert('GCash settings updated!')
      }
    } catch (error) {
      alert('Failed to update settings')
    }
  }

  // Admin: Approve/Reject Cash In
  const approveCashIn = async (requestId) => {
    try {
      const response = await fetch(`${API_URL}/cashin/approve?admin_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (data.success) {
        setPendingCashIns(prev => prev.filter(r => r.id !== requestId))
        alert(`✅ Approved! User credited ₱${data.result.amount}`)
      }
    } catch (error) {
      alert('Failed to approve')
    }
  }

  const rejectCashIn = async (requestId) => {
    if (!confirm('Reject this cash-in request?')) return
    
    try {
      const response = await fetch(`${API_URL}/cashin/reject?admin_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (data.success) {
        setPendingCashIns(prev => prev.filter(r => r.id !== requestId))
      }
    } catch (error) {
      alert('Failed to reject')
    }
  }

  // Cash Out Functions
  const openCashOutModal = () => {
    if (!currentUser) {
      setShowAuthModal(true)
      return
    }
    setCashOutAmount('')
    setCashOutGcashNumber('')
    setCashOutGcashName('')
    setCashOutRequest(null)
    setShowCashOutModal(true)
  }

  const submitCashOutRequest = async () => {
    const amount = parseInt(cashOutAmount)
    if (!amount || amount < 100 || amount > 50000) {
      alert('Amount must be between ₱100 and ₱50,000')
      return
    }
    if (!cashOutGcashNumber || cashOutGcashNumber.length < 10) {
      alert('Please enter a valid GCash number')
      return
    }
    if (!cashOutGcashName || cashOutGcashName.length < 2) {
      alert('Please enter the GCash account name')
      return
    }
    
    // Get ACTUAL credits from database before submitting
    const actualCredits = await getActualCredits()
    if (amount > actualCredits) {
      alert(`Insufficient credits. You have ₱${actualCredits.toLocaleString()}`)
      await refreshUserData()  // Sync local state
      return
    }

    try {
      const response = await fetch(`${API_URL}/cashout/request?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          gcash_number: cashOutGcashNumber,
          gcash_name: cashOutGcashName
        })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        setCashOutRequest(data.request)
        // Update with ACTUAL credits from server response
        setCurrentUser(prev => ({ ...prev, credits: data.request.new_credits }))
        localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.request.new_credits }))
        alert(`✅ Cash-out request submitted!\nReference: ${data.request.reference_code}\nPlease wait for processing.`)
        setShowCashOutModal(false)
      } else {
        alert(data.detail || 'Failed to create request')
        await refreshUserData()  // Sync on error
      }
    } catch (error) {
      alert('Connection error')
      await refreshUserData()
    }
  }

  // Staff: Approve/Reject Cash Out
  const approveCashOut = async (requestId) => {
    const request = pendingCashOuts.find(r => r.id === requestId)
    if (!confirm(`Approve cash-out?\n\nSend ₱${request?.amount} to:\nGCash: ${request?.gcash_number}\nName: ${request?.gcash_name}`)) return
    
    try {
      const response = await fetch(`${API_URL}/cashout/approve?staff_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (data.success) {
        setPendingCashOuts(prev => prev.filter(r => r.id !== requestId))
        alert(`✅ Approved! Send ₱${data.result.amount} to ${data.result.gcash_number}`)
      }
    } catch (error) {
      alert('Failed to approve')
    }
  }

  const rejectCashOut = async (requestId) => {
    if (!confirm('Reject this cash-out request? Credits will be refunded to user.')) return
    
    try {
      const response = await fetch(`${API_URL}/cashout/reject?staff_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (data.success) {
        setPendingCashOuts(prev => prev.filter(r => r.id !== requestId))
        alert('Cash-out rejected. Credits refunded to user.')
      }
    } catch (error) {
      alert('Failed to reject')
    }
  }

  // Audio functions
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioContextRef.current
  }, [])

  const playBeep = useCallback((freq, duration) => {
    if (!soundEnabled) return
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  }, [soundEnabled, getAudioContext])

  const playSound = useCallback((type) => {
    if (!soundEnabled) return
    const ctx = getAudioContext()
    
    switch(type) {
      case 'open':
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          setTimeout(() => playBeep(freq, 0.15), i * 100)
        })
        break
      case 'lastcall':
        [880, 880, 880].forEach((freq, i) => {
          setTimeout(() => playBeep(freq, 0.1), i * 200)
        })
        break
      case 'close':
        playBeep(440, 0.2)
        setTimeout(() => playBeep(349.23, 0.2), 150)
        break
      case 'winner':
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          setTimeout(() => playBeep(freq, 0.2), i * 100)
        })
        break
      case 'bet':
        playBeep(1000, 0.05)
        break
    }
  }, [soundEnabled, playBeep, getAudioContext])

  const speak = useCallback((text) => {
    if (!soundEnabled) return
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.1
      speechSynthesis.speak(utterance)
    }
  }, [soundEnabled])

  // Auto-check stream status and show stream on load
  useEffect(() => {
    const checkStreamAndAutoShow = async () => {
      try {
        const response = await fetch(`${API_URL}/stream/status`)
        const data = await response.json()
        
        // Direct mode - use direct stream URL (scalable)
        if (data.mode === 'direct' && data.stream_url) {
          console.log('✅ Direct stream mode - scalable!')
          setProxyReady(true)
          setIsLoggedIn(true)
          setIsBrowserRunning(true)
          setStreamUrl(data.stream_url)
          setShowStream(true)
          setStreamStatus('loading')
          return
        }
        
        // Proxy mode - use proxy URL
        if (data.authenticated && data.stream_url) {
          console.log('✅ Proxy stream ready!')
          setProxyReady(true)
          setIsLoggedIn(true)
          setIsBrowserRunning(true)
          setStreamUrl(`${API_URL}${data.stream_url}`)
          setShowStream(true)
          setStreamStatus('loading')
        } else {
          console.log('⏳ Waiting for stream to be ready...')
          setTimeout(checkStreamAndAutoShow, 3000)
        }
      } catch (error) {
        console.log('⏳ Backend not ready yet, retrying...')
        setTimeout(checkStreamAndAutoShow, 2000)
      }
    }
    
    setTimeout(checkStreamAndAutoShow, 2000)
  }, [])

  // WebSocket connection
  useEffect(() => {
    const connectWS = () => {
      const ws = new WebSocket(WS_URL)
      
      ws.onopen = () => {
        console.log('WebSocket connected')
        setConnected(true)
      }
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        handleWSMessage(data)
      }
      
      ws.onclose = () => {
        console.log('WebSocket disconnected')
        setConnected(false)
        setTimeout(connectWS, 3000)
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
      
      wsRef.current = ws
    }
    
    connectWS()
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  // HLS Video Player Effect - OPTIMIZED FOR MOBILE & DESKTOP
  useEffect(() => {
    if (!streamUrl || !videoRef.current || !showStream) return
    
    const video = videoRef.current
    setStreamStatus('loading')
    
    // Detect device type for logging
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    
    // Always use HLS.js - better error recovery than native player for proxy streams
    if (Hls.isSupported()) {
      console.log(isIOS ? '🍎 iOS detected - using HLS.js for reliable proxy streaming' : '📺 Using HLS.js player')
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      
      // Optimized for smooth playback on mobile - large buffer
      const hls = new Hls({
        enableWorker: true,
        // DISABLE low latency - prioritize smooth playback
        lowLatencyMode: false,
        backBufferLength: 60,
        // Stay behind live edge for buffer room
        liveSyncDurationCount: 5,        // Stay 10sec behind live
        liveMaxLatencyDurationCount: 15, // Allow up to 30sec behind
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 3,
        // LARGE buffer to prevent stutter
        maxBufferLength: 60,             // 60 seconds buffer
        maxMaxBufferLength: 120,         // Up to 2 min buffer
        maxBufferSize: 100 * 1000 * 1000, // 100MB buffer
        maxBufferHole: 2,                // Allow 2sec gaps
        // Generous timeouts for mobile
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 10,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 6,
        levelLoadingTimeOut: 30000,
        levelLoadingMaxRetry: 6,
        startLevel: -1,
        autoStartLoad: true,
        progressive: true,
        // Start playback only after buffer is ready
        startPosition: -1,
        xhrSetup: (xhr, url) => {
          xhr.withCredentials = false
        }
      })
      
      console.log('📺 Stream player: Smooth mode (large buffer for mobile)')
      
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ Stream loaded - Low latency mode active')
        setStreamStatus('playing')
        // Ensure muted for autoplay to work on mobile
        video.muted = true
        video.play().catch(e => console.log('Autoplay prevented:', e))
      })
      
      hls.on(Hls.Events.FRAG_LOADED, () => {
        if (streamStatus !== 'playing') {
          setStreamStatus('playing')
        }
      })
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.warn('HLS Fatal Error, recovering...', data.type)
          switch(data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('🔄 Network error, restarting...')
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('🔄 Media error, recovering...')
              hls.recoverMediaError()
              break
            default:
              console.log('🔄 Fatal error, reloading stream...')
              hls.destroy()
              setTimeout(() => {
                setShowStream(false)
                setTimeout(() => setShowStream(true), 500)
              }, 1000)
              break
          }
        }
      })
      
      const keepLive = setInterval(() => {
        if (video && hls.liveSyncPosition) {
          const currentTime = video.currentTime
          const livePosition = hls.liveSyncPosition
          const drift = livePosition - currentTime
          
          if (drift > 3) {
            console.log(`⏩ Syncing to live (was ${drift.toFixed(1)}s behind)`)
            video.currentTime = livePosition
          }
        }
      }, 5000)
      
      hlsRef.current = hls
      
      return () => {
        clearInterval(keepLive)
      }
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setStreamStatus('playing')
        video.play().catch(e => console.log('Autoplay prevented:', e))
      })
      video.addEventListener('error', () => {
        setStreamStatus('error')
      })
    }
    
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [streamUrl, showStream])

  const handleWSMessage = (data) => {
    switch(data.type) {
      case 'connected':
      case 'state_update':
        setFightNumber(data.data.fight_number)
        setStatus(data.data.status)
        setBets(data.data.bets || [])
        setHistory(data.data.history || [])
        setStreamDelay(data.data.stream_delay)
        setLastCallTime(data.data.last_call_time)
        setIsBrowserRunning(data.data.is_browser_running)
        setIsLoggedIn(data.data.is_logged_in)
        break
      
      case 'arena_loaded':
        if (data.proxy_url && data.proxy_ready) {
          setStreamUrl(data.proxy_url)
          setProxyReady(true)
          console.log('✅ Using proxy stream:', data.proxy_url)
        } else if (data.stream_url) {
          setStreamUrl(data.stream_url)
        }
        break
        
      case 'stream_refreshed':
        if (data.stream_url) {
          setStreamUrl(data.stream_url)
        }
        break
      
      case 'cookies_extracted':
        if (data.proxy_ready) {
          setProxyReady(true)
          setStreamUrl(PROXY_STREAM_URL)
          console.log('✅ Cookies extracted, proxy ready!')
        }
        break
      
      case 'auto_login_complete':
        if (data.success && data.proxy_ready) {
          console.log('✅ Auto-login complete! Showing stream...')
          setProxyReady(true)
          setIsLoggedIn(true)
          setIsBrowserRunning(true)
          setStreamUrl(PROXY_STREAM_URL)
          setShowStream(true)
          setStreamStatus('loading')
        }
        break
        
      case 'betting_status':
        setStatus(data.status)
        if (data.status === 'open') {
          playSound('open')
          speak('Betting is now open!')
        } else if (data.status === 'lastcall') {
          playSound('lastcall')
          speak(`Last call! ${data.countdown} seconds!`)
          startCountdown(data.countdown)
        } else if (data.status === 'closed') {
          playSound('close')
          speak('Betting is now closed!')
        }
        break
        
      case 'winner_declared':
        setWinner(data.winner)
        setTimeout(async () => {
          playSound('winner')
          speak(`${data.winner === 'meron' ? 'Meron' : data.winner === 'wala' ? 'Wala' : data.winner} wins!`)
          
          // Check if current user won and update credits from SERVER data
          if (currentUser && data.payouts) {
            const myPayout = data.payouts.find(p => p.user_id === currentUser.id)
            if (myPayout) {
              // Update with ACTUAL credits from server
              setCurrentUser(prev => ({ ...prev, credits: myPayout.new_credits }))
              localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: myPayout.new_credits }))
              
              if (myPayout.payout) {
                alert(`🎉 You won ₱${myPayout.payout.toLocaleString()}! New balance: ₱${myPayout.new_credits.toLocaleString()}`)
              } else if (myPayout.refund) {
                alert(`💰 Refunded ₱${myPayout.refund.toLocaleString()}. Balance: ₱${myPayout.new_credits.toLocaleString()}`)
              }
            }
          }
          
          // Always refresh to ensure credits are synced with database
          await refreshUserData()
        }, data.delay * 1000)
        break
        
      case 'fight_reset':
        setFightNumber(data.fight)
        setWinner(null)
        setCountdown(null)
        speak(`Ready for fight number ${data.fight}`)
        break
        
      case 'new_bet':
        playSound('bet')
        break
        
      case 'new_cashin_request':
        // Admin/Cashier: new cash-in request received
        if (isStaff && data.request) {
          setPendingCashIns(prev => [data.request, ...prev])
          playSound('bet') // Reuse bet sound for notification
        }
        break
        
      case 'cashin_approved':
        // User: their cash-in was approved
        if (currentUser && data.user_id === currentUser.id) {
          setCurrentUser(prev => ({ ...prev, credits: data.new_credits }))
          localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.new_credits }))
          alert(`✅ Your cash-in of ₱${data.amount} was approved! New balance: ₱${data.new_credits}`)
          closeCashInModal()
        }
        break
        
      case 'new_cashout_request':
        // Staff: new cash-out request
        if (isStaff && data.request) {
          setPendingCashOuts(prev => [data.request, ...prev])
          playSound('bet')
        }
        break
        
      case 'cashout_approved':
        // User: their cash-out was approved
        if (currentUser && data.user_id === currentUser.id) {
          alert(`✅ Your cash-out of ₱${data.amount} was approved! Check your GCash.`)
        }
        break
        
      case 'cashout_rejected':
        // User: their cash-out was rejected (refunded)
        if (currentUser && data.user_id === currentUser.id) {
          setCurrentUser(prev => ({ ...prev, credits: data.new_credits }))
          localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.new_credits }))
          alert(`Your cash-out was rejected. ₱${data.amount} has been refunded to your account.`)
        }
        break
    }
  }

  const startCountdown = (seconds) => {
    setCountdown(seconds)
    clearInterval(countdownRef.current)
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          return null
        }
        if (prev <= 4) playBeep(880, 0.1)
        return prev - 1
      })
    }, 1000)
  }

  // API calls
  const apiCall = async (endpoint, method = 'POST', body = null) => {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      }
      if (body) options.body = JSON.stringify(body)
      
      const response = await fetch(`${API_URL}${endpoint}`, options)
      return await response.json()
    } catch (error) {
      console.error('API Error:', error)
      return null
    }
  }

  const startBrowser = async () => {
    setLoading('Starting browser...')
    await apiCall('/automation/start?headless=false')
    setLoading('')
  }

  const quickStartWCC = async () => {
    setLoading('Quick starting WCC...')
    setLoading('Starting browser...')
    await startBrowser()
    await new Promise(r => setTimeout(r, 2000))
    
    setLoading('Logging in to WCC...')
    const loginResult = await apiCall('/automation/login-wcc')
    
    if (loginResult?.success) {
      await new Promise(r => setTimeout(r, 1500))
      setLoading('Entering arena...')
      const result = await apiCall('/automation/enter-arena')
      if (result?.proxy_ready && result?.proxy_url) {
        setStreamUrl(result.proxy_url)
        setProxyReady(true)
        setShowStream(true)
      }
    }
    
    setLoading('')
  }

  const stopBrowser = async () => {
    setLoading('Stopping browser...')
    await apiCall('/automation/stop')
    setLoading('')
  }

  const openBetting = () => apiCall('/betting/open')
  const triggerLastCall = () => apiCall('/betting/last-call')
  const closeBetting = () => apiCall('/betting/close')
  
  const declareWinner = (winner) => apiCall('/fight/declare-winner', 'POST', { winner })
  const resetFight = () => apiCall('/fight/reset')

  const addBet = async (side) => {
    if (!currentUser) {
      setShowAuthModal(true)
      return
    }
    
    const amount = parseInt(betAmount)
    const name = isAdmin ? betName.trim() : userName
    
    if (!name || !amount || amount <= 0) {
      alert('Please enter a valid bet amount')
      return
    }
    
    // Basic client-side check (server will verify against database)
    if (!isAdmin && amount > userCredit) {
      alert('Insufficient credits!')
      return
    }
    
    try {
      // Send bet with user_id - SERVER will validate and deduct credits from DATABASE
      const response = await fetch(`${API_URL}/betting/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          amount: amount,
          side: side,
          user_id: isAdmin ? null : currentUser.id  // Server validates credits for non-admin
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        // Server rejected - show actual error (e.g., insufficient credits from DB)
        alert(data.detail || 'Failed to place bet')
        // Refresh credits from database to sync
        await refreshUserData()
        return
      }
      
      // Bet successful - update credits from SERVER response (not calculated locally)
      if (data.new_credits !== undefined) {
        setCurrentUser(prev => ({ ...prev, credits: data.new_credits }))
        localStorage.setItem('sabong_user', JSON.stringify({ ...currentUser, credits: data.new_credits }))
      }
      
      if (isAdmin) setBetName('')
      setBetAmount('')
      
    } catch (error) {
      console.error('Bet error:', error)
      alert('Connection error. Please try again.')
      await refreshUserData()  // Sync credits on error
    }
  }

  const removeBet = (id) => apiCall(`/betting/${id}`, 'DELETE')

  const updateSettings = async () => {
    await apiCall('/settings', 'PUT', { stream_delay: streamDelay, last_call_time: lastCallTime })
  }

  // Calculate totals
  const meronBets = bets.filter(b => b.side === 'meron')
  const walaBets = bets.filter(b => b.side === 'wala')
  const meronTotal = meronBets.reduce((sum, b) => sum + b.amount, 0)
  const walaTotal = walaBets.reduce((sum, b) => sum + b.amount, 0)

  // Keyboard shortcuts (Admin only)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isAdmin) return
      if (e.target.tagName === 'INPUT') return
      
      switch(e.key.toLowerCase()) {
        case 'o': openBetting(); break
        case 'l': triggerLastCall(); break
        case 'c': closeBetting(); break
        case 'm': declareWinner('meron'); break
        case 'w': declareWinner('wala'); break
        case 'd': declareWinner('draw'); break
        case 'r': resetFight(); break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAdmin])

  return (
    <div className="app">
      <div className="bg-pattern"></div>
      
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-content auth-modal" onClick={e => e.stopPropagation()}>
            <h2>{authMode === 'login' ? '🔐 Login' : '📝 Register'}</h2>
            
            <div className="auth-tabs">
              <button 
                className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
              >
                Login
              </button>
              <button 
                className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
              >
                Register
              </button>
            </div>
            
            <input
              type="text"
              placeholder="Username"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (authMode === 'login' ? handleLogin() : handleRegister())}
            />
            
            {authError && <p className="login-error">{authError}</p>}
            
            {authMode === 'register' && (
              <p className="register-info">🎁 New accounts start with ₱1,000 credits!</p>
            )}
            
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowAuthModal(false)}>Cancel</button>
              <button 
                className="btn-login" 
                onClick={authMode === 'login' ? handleLogin : handleRegister}
                disabled={authLoading}
              >
                {authLoading ? '...' : authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Cash In Modal */}
      {showCashInModal && (
        <div className="modal-overlay" onClick={closeCashInModal}>
          <div className="modal-content cashin-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={closeCashInModal}>×</button>
            <h2>💵 Cash In</h2>
            
            {cashInStep === 1 && (
              <>
                <div className="cashin-method">
                  <div className="method-option active">
                    <span className="method-icon">📱</span>
                    <span>GCash</span>
      </div>
                </div>
                
                <div className="cashin-amount-section">
                  <label>Amount* <span className="amount-hint">(Min: ₱100, Max: ₱50,000)</span></label>
                  <input
                    type="number"
                    placeholder="Enter amount"
                    value={cashInAmount}
                    onChange={(e) => setCashInAmount(e.target.value)}
                    min="100"
                    max="50000"
                  />
                  
                  <div className="quick-amounts">
                    {[100, 200, 500, 1000, 3000, 5000, 10000, 50000].map(amt => (
                      <button 
                        key={amt} 
                        className={`quick-amount-btn ${cashInAmount === String(amt) ? 'active' : ''}`}
                        onClick={() => setCashInAmount(String(amt))}
                      >
                        ₱{amt.toLocaleString()}
        </button>
                    ))}
      </div>
                </div>
                
                <button 
                  className="btn-proceed"
                  onClick={submitCashInRequest}
                  disabled={!cashInAmount || parseInt(cashInAmount) < 100}
                >
                  Proceed →
                </button>
              </>
            )}
            
            {cashInStep === 2 && cashInRequest && (
              <div className="cashin-qr-section">
                <p className="qr-instruction">Scan QR code with your GCash app</p>
                
                <div className="qr-container">
                  <QRCodeSVG
                    value={gcashSettings.gcash_number}
                    size={180}
                    level="H"
                    includeMargin={true}
                    bgColor="#ffffff"
                    fgColor="#000000"
                  />
                </div>
                
                <div className="gcash-details">
                  <div className="gcash-info">
                    <span className="label">GCash Number:</span>
                    <span className="value">{gcashSettings.gcash_number}</span>
                  </div>
                  <div className="gcash-info">
                    <span className="label">Name:</span>
                    <span className="value">{gcashSettings.gcash_name}</span>
                  </div>
                  <div className="gcash-info highlight">
                    <span className="label">Amount:</span>
                    <span className="value">₱{parseInt(cashInRequest.amount).toLocaleString()}</span>
                  </div>
                  <div className="gcash-info reference">
                    <span className="label">Reference Code:</span>
                    <span className="value code">{cashInRequest.reference_code}</span>
                  </div>
                </div>
                
                <div className="cashin-instructions">
                  <p>⚠️ <strong>Important:</strong></p>
                  <ol>
                    <li>Send exactly <strong>₱{parseInt(cashInRequest.amount).toLocaleString()}</strong></li>
                    <li>Include reference: <strong>{cashInRequest.reference_code}</strong> in message</li>
                    <li>Wait for admin approval (usually within minutes)</li>
                  </ol>
                </div>
                
                <button className="btn-done" onClick={closeCashInModal}>
                  Done - I've sent the payment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Cash Out Modal */}
      {showCashOutModal && (
        <div className="modal-overlay" onClick={() => setShowCashOutModal(false)}>
          <div className="modal-content cashout-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowCashOutModal(false)}>×</button>
            <h2>💸 Cash Out</h2>
            
            <div className="cashout-balance">
              <span>Available Balance:</span>
              <span className="balance-amount">₱{userCredit.toLocaleString()}</span>
            </div>
            
            <div className="cashout-form">
              <label>Amount* <span className="amount-hint">(Min: ₱100, Max: ₱50,000)</span></label>
              <input
                type="number"
                placeholder="Enter amount"
                value={cashOutAmount}
                onChange={(e) => setCashOutAmount(e.target.value)}
                min="100"
                max={Math.min(50000, userCredit)}
              />
              
              <div className="quick-amounts">
                {[100, 500, 1000, 5000].filter(amt => amt <= userCredit).map(amt => (
                  <button 
                    key={amt} 
                    className={`quick-amount-btn ${cashOutAmount === String(amt) ? 'active' : ''}`}
                    onClick={() => setCashOutAmount(String(amt))}
                  >
                    ₱{amt.toLocaleString()}
                  </button>
                ))}
                {userCredit >= 100 && (
                  <button 
                    className={`quick-amount-btn ${cashOutAmount === String(userCredit) ? 'active' : ''}`}
                    onClick={() => setCashOutAmount(String(userCredit))}
                  >
                    ALL
                  </button>
                )}
              </div>
              
              <label>Your GCash Number*</label>
              <input
                type="text"
                placeholder="09XXXXXXXXX"
                value={cashOutGcashNumber}
                onChange={(e) => setCashOutGcashNumber(e.target.value)}
                maxLength={11}
              />
              
              <label>GCash Account Name*</label>
              <input
                type="text"
                placeholder="Juan Dela Cruz"
                value={cashOutGcashName}
                onChange={(e) => setCashOutGcashName(e.target.value)}
              />
            </div>
            
            <div className="cashout-warning">
              ⚠️ Credits will be deducted immediately. Processing usually takes a few minutes.
            </div>
            
            <button 
              className="btn-proceed cashout"
              onClick={submitCashOutRequest}
              disabled={!cashOutAmount || parseInt(cashOutAmount) < 100 || parseInt(cashOutAmount) > userCredit}
            >
              Submit Cash Out Request
            </button>
          </div>
        </div>
      )}

      {/* Transaction History Modal */}
      {showTransactionsModal && (
        <div className="modal-overlay" onClick={() => setShowTransactionsModal(false)}>
          <div className="modal-content transactions-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowTransactionsModal(false)}>×</button>
            <h2>📜 Transaction History</h2>
            
            <div className="transaction-tabs">
              <button 
                className={`tab-btn ${transactionTab === 'bets' ? 'active' : ''}`}
                onClick={() => setTransactionTab('bets')}
              >
                🎲 Bets ({betHistory.length})
              </button>
              <button 
                className={`tab-btn ${transactionTab === 'cashin' ? 'active' : ''}`}
                onClick={() => setTransactionTab('cashin')}
              >
                💵 Cash In ({cashInHistory.length})
              </button>
              <button 
                className={`tab-btn ${transactionTab === 'cashout' ? 'active' : ''}`}
                onClick={() => setTransactionTab('cashout')}
              >
                💸 Cash Out ({cashOutHistory.length})
              </button>
            </div>
            
            <div className="transaction-content">
              {loadingTransactions ? (
                <div className="loading-transactions">
                  <div className="spinner"></div>
                  <span>Loading...</span>
                </div>
              ) : (
                <>
                  {/* Bet History */}
                  {transactionTab === 'bets' && (
                    <div className="bet-history-list">
                      {betHistory.length === 0 ? (
                        <div className="empty-history">No betting history yet</div>
                      ) : (
                        betHistory.map((bet, idx) => (
                          <div key={idx} className={`history-item bet-item ${bet.result}`}>
                            <div className="history-main">
                              <div className="history-left">
                                <span className={`side-badge ${bet.side}`}>
                                  {bet.side === 'meron' ? '🔴' : '🔵'} {bet.side.toUpperCase()}
                                </span>
                                <span className="fight-num">Fight #{bet.fight_number}</span>
                              </div>
                              <div className="history-right">
                                <span className="bet-amount">₱{bet.amount.toLocaleString()}</span>
                                <span className={`result-badge ${bet.result}`}>
                                  {bet.result === 'win' && `🏆 +₱${bet.payout.toLocaleString()}`}
                                  {bet.result === 'lose' && '❌ Lost'}
                                  {bet.result === 'draw' && `🤝 Refunded`}
                                  {bet.result === 'cancelled' && `↩️ Refunded`}
                                </span>
                              </div>
                            </div>
                            <div className="history-date">
                              {new Date(bet.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  
                  {/* Cash In History */}
                  {transactionTab === 'cashin' && (
                    <div className="cashin-history-list">
                      {cashInHistory.length === 0 ? (
                        <div className="empty-history">No cash-in history yet</div>
                      ) : (
                        cashInHistory.map((tx, idx) => (
                          <div key={idx} className={`history-item cashin-item ${tx.status}`}>
                            <div className="history-main">
                              <div className="history-left">
                                <span className="tx-amount">+₱{tx.amount.toLocaleString()}</span>
                                <span className="tx-ref">Ref: {tx.reference_code}</span>
                              </div>
                              <div className="history-right">
                                <span className={`status-badge ${tx.status}`}>
                                  {tx.status === 'pending' && '⏳ Pending'}
                                  {tx.status === 'approved' && '✅ Approved'}
                                  {tx.status === 'rejected' && '❌ Rejected'}
                                </span>
                              </div>
                            </div>
                            <div className="history-date">
                              {new Date(tx.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  
                  {/* Cash Out History */}
                  {transactionTab === 'cashout' && (
                    <div className="cashout-history-list">
                      {cashOutHistory.length === 0 ? (
                        <div className="empty-history">No cash-out history yet</div>
                      ) : (
                        cashOutHistory.map((tx, idx) => (
                          <div key={idx} className={`history-item cashout-item ${tx.status}`}>
                            <div className="history-main">
                              <div className="history-left">
                                <span className="tx-amount">-₱{tx.amount.toLocaleString()}</span>
                                <span className="tx-gcash">{tx.gcash_number}</span>
                              </div>
                              <div className="history-right">
                                <span className={`status-badge ${tx.status}`}>
                                  {tx.status === 'pending' && '⏳ Processing'}
                                  {tx.status === 'approved' && '✅ Sent'}
                                  {tx.status === 'rejected' && '❌ Rejected'}
                                </span>
                              </div>
                            </div>
                            <div className="history-date">
                              Ref: {tx.reference_code} • {new Date(tx.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            
            <button className="btn-refresh" onClick={fetchTransactionHistory}>
              🔄 Refresh
            </button>
          </div>
        </div>
      )}
      
      {/* GCash Settings Modal (Admin) */}
      {showGcashSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowGcashSettingsModal(false)}>
          <div className="modal-content gcash-settings-modal" onClick={e => e.stopPropagation()}>
            <h2>⚙️ GCash Settings</h2>
            
            <div className="settings-form">
              <label>GCash Number</label>
              <input
                type="text"
                placeholder="09XXXXXXXXX"
                value={editGcashNumber}
                onChange={(e) => setEditGcashNumber(e.target.value)}
              />
              
              <label>Account Name</label>
              <input
                type="text"
                placeholder="Your Name"
                value={editGcashName}
                onChange={(e) => setEditGcashName(e.target.value)}
              />
            </div>
            
            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowGcashSettingsModal(false)}>Cancel</button>
              <button className="btn-login" onClick={updateGcashSettings}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Stream Cookie Modal (Admin) */}
      {showCookieModal && (
        <div className="modal-overlay" onClick={() => setShowCookieModal(false)}>
          <div className="modal-content cookie-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowCookieModal(false)}>×</button>
            <h2>🍪 Set Stream Cookies</h2>
            
            <div className="cookie-instructions">
              <p><strong>How to get cookies:</strong></p>
              <ol>
                <li>Open <a href="https://www.wccgames8.xyz" target="_blank" rel="noreferrer">WCC Games</a> in your browser</li>
                <li>Login to your account</li>
                <li>Press <kbd>F12</kbd> to open DevTools</li>
                <li>Go to <strong>Application</strong> → <strong>Cookies</strong></li>
                <li>Right-click → Copy all as JSON, OR</li>
                <li>Go to <strong>Network</strong> tab, click any request, copy the <code>Cookie</code> header value</li>
              </ol>
            </div>
            
            <div className="cookie-input-section">
              <label>Paste cookies here:</label>
              <textarea
                placeholder='Paste JSON array: [{"name": "session", "value": "..."}, ...] 
OR cookie string: session=abc123; token=xyz456'
                value={cookieInput}
                onChange={(e) => setCookieInput(e.target.value)}
                rows={6}
              />
            </div>
            
            <button 
              className="btn-proceed"
              onClick={submitStreamCookies}
              disabled={cookieLoading || !cookieInput.trim()}
            >
              {cookieLoading ? '⏳ Setting...' : '🚀 Set Cookies & Start Stream'}
            </button>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="header">
        <div className="logo">🐓 SABONG {isAdmin ? 'ADMIN' : isCashier ? 'CASHIER' : 'ARENA'}</div>
        <div className="header-controls">
          {currentUser && !isStaff && (
            <>
              <div className="user-credit">
                💰 ₱{userCredit.toLocaleString()}
              </div>
              <button className="cashin-btn" onClick={openCashInModal}>
                💵 In
              </button>
              <button className="cashout-btn" onClick={openCashOutModal}>
                💸 Out
              </button>
              <button className="history-btn" onClick={openTransactionsModal} title="Transaction History">
                📜
              </button>
            </>
          )}
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '🟢' : '🔴'}
          </div>
          <div className="fight-number">
            <span className="fight-label">FIGHT #</span>
            <span className="fight-value">{fightNumber}</span>
          </div>
          
          {currentUser ? (
            <div className="user-menu">
              <span className="username-display">👤 {userName}</span>
              <button className="admin-logout-btn" onClick={handleLogout}>
                🚪 Logout
              </button>
            </div>
          ) : (
            <button className="admin-login-btn" onClick={() => setShowAuthModal(true)}>
              🔐 Login
            </button>
          )}
        </div>
      </header>

      <main className="main-container">
        {/* Left Column - Stream & Betting Board */}
        <div className="left-column">
          {/* Stream Status Panel - Only show when not playing */}
          {!showStream && (
            <div className={`panel-card stream-status-panel ${proxyReady ? 'ready' : 'loading'}`}>
              <div className="panel-title">
                📺 LIVE STREAM
                {proxyReady && <span className="proxy-badge">✅ READY</span>}
              </div>
              
              {proxyReady ? (
                <p className="stream-ready-msg">
                  🎉 Stream ready!
                  <button 
                    className="watch-stream-btn" 
                    onClick={() => {
                      setStreamUrl(PROXY_STREAM_URL)
                      setShowStream(true)
                      setStreamStatus('loading')
                    }}
                  >
                    📺 Watch Stream
                  </button>
                </p>
              ) : (
                <div className="auto-login-status">
                  <div className="loading-spinner"></div>
                  <p>⏳ Waiting for stream cookies...</p>
                  <p className="cookie-hint">
                    Run <code>cookie-sync/RUN_SYNC.bat</code> on your PC
                  </p>
                  {isAdmin && (
                    <button 
                      className="cookie-btn"
                      onClick={() => setShowCookieModal(true)}
                    >
                      🍪 Set Cookies Manually
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Automation Control Panel - Admin only, when stream has issues */}
          {isAdmin && (streamStatus === 'error' || (!proxyReady && !showStream)) && (
            <div className="panel-card automation-panel collapsed">
              <div className="panel-title" onClick={() => document.querySelector('.automation-panel')?.classList.toggle('collapsed')}>
                🛠️ Manual Controls
                <span className="expand-icon">▼</span>
              </div>
              
              <div className="automation-content">
                {loading && (
                  <div className="loading-bar">
                    <div className="loading-spinner"></div>
                    <span>{loading}</span>
                  </div>
                )}
                
                <div className="automation-buttons">
                  <button className="auto-btn quick-start" onClick={quickStartWCC}>
                    ⚡ Quick Start WCC
                  </button>
                  <button className="auto-btn stop" onClick={stopBrowser}>
                    ⏹️ Stop Browser
                  </button>
                </div>
                
                <div className="automation-status">
                  <span>Browser: {isBrowserRunning ? '✅' : '❌'}</span>
                  <span>Login: {isLoggedIn ? '✅' : '❌'}</span>
                  <span>Proxy: {proxyReady ? '✅' : '❌'}</span>
                </div>
              </div>
      </div>
          )}

          {/* Live Stream Player */}
          {showStream && streamUrl && (
            <div className="panel-card stream-panel">
              <div className="panel-title">
                📺 LIVE
                <div className="stream-controls-header">
                  <span className={`stream-status-badge ${streamStatus}`}>
                    {streamStatus === 'loading' && '⏳ Loading...'}
                    {streamStatus === 'playing' && '🔴 LIVE'}
                    {streamStatus === 'error' && '🔄 Reconnecting...'}
                    {streamStatus === 'unknown' && '⏳'}
                  </span>
                  {/* Live Audio Control Button */}
                  <button 
                    className={`audio-toggle-btn ${audioMuted ? 'muted' : 'playing'}`}
                    onClick={toggleAudio}
                    title={audioMuted ? 'Unmute Live Audio' : 'Mute Live Audio'}
                  >
                    {audioMuted ? '🔇' : '🔊'}
                  </button>
                  {isAdmin && (
                    <>
                      <button className="stream-refresh-btn" onClick={() => {
                        setStreamStatus('loading')
                        setShowStream(false)
                        setTimeout(() => setShowStream(true), 100)
                      }}>🔄</button>
                      <button className="stream-close-btn" onClick={() => setShowStream(false)}>✕</button>
                    </>
                  )}
                </div>
              </div>
              <div className="video-container">
                <video 
                  ref={videoRef}
                  className="stream-video no-controls"
                  autoPlay
                  muted={audioMuted}
                  playsInline
                  disablePictureInPicture
                  controlsList="nodownload nofullscreen noremoteplayback"
                  onContextMenu={(e) => e.preventDefault()}
                />
                {streamStatus === 'loading' && (
                  <div className="stream-loading-overlay">
                    <div className="loading-spinner large"></div>
                    <p>Loading stream...</p>
                  </div>
                )}
                {streamStatus === 'error' && (
                  <div className="stream-loading-overlay">
                    <div className="loading-spinner large"></div>
                    <p>Reconnecting...</p>
                  </div>
                )}
                {streamStatus === 'playing' && (
                  <div className="live-indicator">
                    <span className="live-dot"></span> LIVE
                  </div>
                )}
                {/* Live Audio Indicator */}
                {!audioMuted && streamStatus === 'playing' && (
                  <div className="audio-indicator">
                    <div className="audio-bars">
                      <div className="audio-bar"></div>
                      <div className="audio-bar"></div>
                      <div className="audio-bar"></div>
                      <div className="audio-bar"></div>
                    </div>
                    <span>LIVE AUDIO</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Betting Board */}
          <div className="betting-board">
            <div className={`bet-side meron ${winner === 'meron' ? 'winner' : ''}`}>
              {winner === 'meron' && <div className="winner-badge">🏆 WINNER</div>}
              <div className="bet-side-name">MERON</div>
              <div className="bet-amount">₱{meronTotal.toLocaleString()}</div>
              <div className="bet-count">{meronBets.length} bet{meronBets.length !== 1 ? 's' : ''}</div>
            </div>
            <div className={`bet-side wala ${winner === 'wala' ? 'winner' : ''}`}>
              {winner === 'wala' && <div className="winner-badge">🏆 WINNER</div>}
              <div className="bet-side-name">WALA</div>
              <div className="bet-amount">₱{walaTotal.toLocaleString()}</div>
              <div className="bet-count">{walaBets.length} bet{walaBets.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Status Display */}
          <div className="panel-card status-panel">
            <div className={`status-text ${status}`}>
              {status === 'waiting' && 'WAITING'}
              {status === 'open' && 'BETTING OPEN'}
              {status === 'lastcall' && 'LAST CALL'}
              {status === 'closed' && 'BETTING CLOSED'}
              {status === 'result' && (
                winner === 'meron' ? '🔴 MERON WINS!' :
                winner === 'wala' ? '🔵 WALA WINS!' :
                winner === 'draw' ? '⚪ DRAW!' :
                winner === 'cancelled' ? '❌ CANCELLED' : 'RESULT'
              )}
            </div>
            <div className="countdown-display">
              {countdown !== null ? countdown : 
               status === 'open' ? '🟢' :
               status === 'closed' ? '🔴' :
               status === 'result' ? '🏆' : '--'}
            </div>
          </div>
        </div>

        {/* Right Column - Controls */}
        <div className="control-panel">
          {/* ADMIN: Declarator Controls */}
          {isAdmin && (
            <div className="panel-card">
              <div className="panel-title">🎤 DECLARATOR CONTROLS</div>
              
              <div className="delay-controls">
                <div className="delay-control">
                  <label>Stream Delay:</label>
                  <input 
                    type="number" 
                    value={streamDelay} 
                    onChange={(e) => setStreamDelay(parseInt(e.target.value) || 0)}
                    onBlur={updateSettings}
                  />
                  <span>sec</span>
                </div>
                <div className="delay-control">
                  <label>Last Call Time:</label>
                  <input 
                    type="number" 
                    value={lastCallTime} 
                    onChange={(e) => setLastCallTime(parseInt(e.target.value) || 10)}
                    onBlur={updateSettings}
                  />
                  <span>sec</span>
                </div>
              </div>

              <div className="declarator-buttons">
                <button className="declare-btn open" onClick={openBetting}>
                  🟢 OPEN BETTING
                </button>
                <button className="declare-btn last-call" onClick={triggerLastCall}>
                  ⚠️ LAST CALL
                </button>
                <button className="declare-btn close" onClick={closeBetting}>
                  🔴 CLOSE BETTING
                </button>
                <button className="declare-btn meron-win" onClick={() => declareWinner('meron')}>
                  🔴 MERON WINS
                </button>
                <button className="declare-btn wala-win" onClick={() => declareWinner('wala')}>
                  🔵 WALA WINS
                </button>
                <button className="declare-btn draw" onClick={() => declareWinner('draw')}>
                  ⚪ DRAW
                </button>
                <button className="declare-btn cancelled" onClick={() => declareWinner('cancelled')}>
                  ❌ CANCELLED
                </button>
                <button className="declare-btn reset" onClick={resetFight}>
                  🔄 RESET / NEXT FIGHT
                </button>
              </div>

              <div className="sound-toggle">
                <label>🔊 Sound Effects</label>
                <label className="toggle-switch">
                  <input 
                    type="checkbox" 
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              
              {/* GCash Settings Button */}
              <button 
                className="gcash-settings-btn"
                onClick={() => setShowGcashSettingsModal(true)}
              >
                ⚙️ GCash Settings
              </button>
              
              {/* Stream Cookie Button */}
              <button 
                className="gcash-settings-btn"
                onClick={() => setShowCookieModal(true)}
              >
                🍪 Stream Cookies
              </button>
            </div>
          )}
          
          {/* CASHIER: Transaction Controls */}
          {isCashier && (
            <div className="panel-card cashier-panel">
              <div className="panel-title">💳 CASHIER PANEL</div>
              <p className="cashier-info">Process cash-in and cash-out transactions</p>
              
              {/* GCash Settings Button for Cashier */}
              <button 
                className="gcash-settings-btn"
                onClick={() => setShowGcashSettingsModal(true)}
              >
                ⚙️ GCash Settings
              </button>
            </div>
          )}
          
          {/* STAFF: Pending Cash-In Requests (Admin & Cashier) */}
          {isStaff && pendingCashIns.length > 0 && (
            <div className="panel-card cashin-panel">
              <div className="panel-title">💰 PENDING CASH-INS ({pendingCashIns.length})</div>
              <div className="cashin-requests-list">
                {pendingCashIns.map(req => (
                  <div key={req.id} className="cashin-request-item">
                    <div className="request-info">
                      <span className="request-user">{req.username}</span>
                      <span className="request-amount">₱{req.amount.toLocaleString()}</span>
                      <span className="request-ref">{req.reference_code}</span>
                    </div>
                    <div className="request-actions">
                      <button 
                        className="approve-btn"
                        onClick={() => approveCashIn(req.id)}
                      >
                        ✓
                      </button>
                      <button 
                        className="reject-btn"
                        onClick={() => rejectCashIn(req.id)}
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* STAFF: Pending Cash-Out Requests (Admin & Cashier) */}
          {isStaff && pendingCashOuts.length > 0 && (
            <div className="panel-card cashout-panel">
              <div className="panel-title">💸 PENDING CASH-OUTS ({pendingCashOuts.length})</div>
              <div className="cashin-requests-list">
                {pendingCashOuts.map(req => (
                  <div key={req.id} className="cashout-request-item">
                    <div className="request-info">
                      <span className="request-user">{req.username}</span>
                      <span className="request-amount out">-₱{req.amount.toLocaleString()}</span>
                      <span className="request-gcash">→ {req.gcash_number}</span>
                      <span className="request-gcash-name">{req.gcash_name}</span>
                      <span className="request-ref">{req.reference_code}</span>
                    </div>
                    <div className="request-actions">
                      <button 
                        className="approve-btn"
                        onClick={() => approveCashOut(req.id)}
                        title="Approve & Send"
                      >
                        ✓
                      </button>
                      <button 
                        className="reject-btn"
                        onClick={() => rejectCashOut(req.id)}
                        title="Reject & Refund"
                      >
                        ✗
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USER: Account Panel - Prompt login if not logged in (hide for staff) */}
          {!isStaff && (
            <div className="panel-card user-panel">
              <div className="panel-title">👤 MY ACCOUNT</div>
              {currentUser ? (
                <div className="user-info">
                  <div className="credit-display">
                    <span className="credit-label">Balance</span>
                    <span className="credit-amount">₱{userCredit.toLocaleString()}</span>
                  </div>
                  <div className="user-name-display">
                    Logged in as: <strong>{userName}</strong>
                  </div>
                </div>
              ) : (
                <div className="login-prompt">
                  <p>Login to place bets and track your credits!</p>
                  <button className="btn-login-prompt" onClick={() => setShowAuthModal(true)}>
                    🔐 Login / Register
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bet Panel - Not for Cashiers */}
          {!isCashier && (
          <div className="panel-card">
            <div className="panel-title">💰 {isAdmin ? 'ADD BET (Manual)' : 'PLACE BET'}</div>
            <div className="add-bet-form">
              {isAdmin && (
                <input 
                  type="text" 
                  placeholder="Bettor Name"
                  value={betName}
                  onChange={(e) => setBetName(e.target.value)}
                  className="bet-input name"
                />
              )}
              <input 
                type="number" 
                placeholder="Amount"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                className="bet-input amount"
              />
              {!isAdmin && currentUser && (
                <span className="max-bet">Max: ₱{userCredit.toLocaleString()}</span>
              )}
            </div>
            <div className="bet-buttons">
              <button 
                className="bet-btn meron" 
                onClick={() => addBet('meron')}
                disabled={status !== 'open' && status !== 'lastcall'}
              >
                BET MERON
              </button>
              <button 
                className="bet-btn wala" 
                onClick={() => addBet('wala')}
                disabled={status !== 'open' && status !== 'lastcall'}
              >
                BET WALA
              </button>
            </div>
            {(status !== 'open' && status !== 'lastcall') && (
              <p className="betting-closed-msg">⏳ Waiting for betting to open...</p>
            )}
          </div>
          )}

          {/* Current Bets */}
          <div className="panel-card bets-panel">
            <div className="panel-title">
              📋 {isStaff ? `ALL BETS (${bets.length})` : 'MY BETS'}
            </div>
            <div className="bets-list">
              {(() => {
                const displayBets = isStaff ? bets : bets.filter(b => b.name === userName)
                return displayBets.length === 0 ? (
                  <p className="no-bets">{isStaff ? 'No bets yet' : 'You have no bets'}</p>
                ) : (
                  displayBets.map(bet => (
                    <div key={bet.id} className={`bet-item ${bet.side} ${winner && (bet.side === winner ? 'winner' : 'loser')}`}>
                      {isStaff && <span className="bet-name">{bet.name}</span>}
                      <span className={`bet-side-tag ${bet.side}`}>{bet.side.toUpperCase()}</span>
                      <span className="bet-amount">₱{bet.amount.toLocaleString()}</span>
                      {isAdmin && <button className="bet-delete" onClick={() => removeBet(bet.id)}>×</button>}
                    </div>
                  ))
                )
              })()}
            </div>
          </div>

          {/* History */}
          <div className="panel-card history-panel">
            <div className="panel-title">📜 FIGHT HISTORY</div>
            <div className="history-list">
              {history.length === 0 ? (
                <p className="no-history">No history yet</p>
              ) : (
                history.slice(0, isAdmin ? 15 : 10).map((h, i) => (
                  <div key={i} className="history-item">
                    <span className="history-fight">Fight #{h.fight}</span>
                    <span className={`history-result ${h.result}`}>{h.result.toUpperCase()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        {isAdmin ? (
          <>🔒 ADMIN MODE | Shortcuts: O=Open, L=Last Call, C=Close, M=Meron, W=Wala, D=Draw, R=Reset</>
        ) : isCashier ? (
          <>💳 CASHIER MODE | Process cash-in and cash-out transactions</>
        ) : (
          <>🐓 SABONG ARENA | Good luck! 🍀</>
        )}
      </footer>
    </div>
  )
}

export default App
