import { useState, useEffect, useCallback, useRef } from 'react'
import Hls from 'hls.js'
import { QRCodeSVG } from 'qrcode.react'
import './App.css'

// Use environment variables for production, fallback to localhost for development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws'

// Check if running in production
const IS_PRODUCTION = import.meta.env.PROD || API_URL.includes('railway.app') || API_URL.includes('up.railway.app')

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
  
  // Mobile Menu
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  
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
  const [rakePercentage, setRakePercentage] = useState(5)
  
  // Stream URLs - uses the same base as API_URL
  const PROXY_STREAM_URL = `${API_URL}/stream/live.m3u8`
  const [streamUrl, setStreamUrl] = useState(null)
  const [proxyReady, setProxyReady] = useState(false)
  const [streamStatus, setStreamStatus] = useState('unknown')
  const [showStream, setShowStream] = useState(false)
  
  // Bet form
  const [betName, setBetName] = useState('')
  const [betAmount, setBetAmount] = useState('')
  const [chipStack, setChipStack] = useState([]) // Track chips for undo functionality
  
  // Live Audio State (from stream)
  const [audioMuted, setAudioMuted] = useState(true) // Start muted (autoplay policy)
  
  // Refs
  const wsRef = useRef(null)
  const countdownRef = useRef(null)
  const audioContextRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  
  // ===== PRODUCTION SECURITY =====
  // Disable right-click and dev tools in production
  useEffect(() => {
    if (!IS_PRODUCTION) return
    
    // Disable right-click context menu
    const handleContextMenu = (e) => {
      e.preventDefault()
      return false
    }
    
    // Disable dev tools shortcuts
    const handleKeyDown = (e) => {
      // F12
      if (e.key === 'F12') {
        e.preventDefault()
        return false
      }
      // Ctrl+Shift+I (Dev Tools)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault()
        return false
      }
      // Ctrl+Shift+J (Console)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault()
        return false
      }
      // Ctrl+Shift+C (Inspect Element)
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        return false
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault()
        return false
      }
    }
    
    // Detect dev tools open (basic detection)
    const detectDevTools = () => {
      const threshold = 160
      if (window.outerWidth - window.innerWidth > threshold || 
          window.outerHeight - window.innerHeight > threshold) {
        // Dev tools might be open - could log this or take action
        console.clear()
      }
    }
    
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('keydown', handleKeyDown)
    
    // Check periodically for dev tools
    const devToolsInterval = setInterval(detectDevTools, 1000)
    
    // Clear console in production
    console.clear()
    console.log('%c⚠️ STOP!', 'color: red; font-size: 50px; font-weight: bold;')
    console.log('%cThis is a browser feature intended for developers.', 'font-size: 16px;')
    console.log('%cIf someone told you to paste something here, it\'s likely a scam.', 'font-size: 14px; color: gray;')
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('keydown', handleKeyDown)
      clearInterval(devToolsInterval)
    }
  }, [])
  
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

  // Refresh stream without reloading page
  const refreshStream = () => {
    console.log('🔄 Refreshing stream...')
    setStreamStatus('loading')
    
    // Destroy and recreate HLS
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    
    // Toggle stream off and on to trigger useEffect
    setShowStream(false)
    setTimeout(() => {
      setShowStream(true)
    }, 300)
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
  const [processingCashIn, setProcessingCashIn] = useState(null)
  
  const approveCashIn = async (requestId) => {
    if (processingCashIn) return // Prevent double-clicks
    setProcessingCashIn(requestId)
    
    try {
      const response = await fetch(`${API_URL}/cashin/approve?admin_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Remove from list immediately
        setPendingCashIns(prev => prev.filter(r => r.id !== requestId))
        // Use setTimeout to allow React to re-render before showing alert
        const amount = data.result?.amount || 0
        setTimeout(() => {
          alert(`✅ Approved! User credited ₱${amount.toLocaleString()}`)
        }, 100)
      } else {
        alert(data.detail || 'Failed to approve')
      }
    } catch (error) {
      console.error('Approve error:', error)
      alert('Failed to approve - connection error')
    } finally {
      setProcessingCashIn(null)
    }
  }

  const rejectCashIn = async (requestId) => {
    if (!confirm('Reject this cash-in request?')) return
    if (processingCashIn) return
    setProcessingCashIn(requestId)
    
    try {
      const response = await fetch(`${API_URL}/cashin/reject?admin_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        setPendingCashIns(prev => prev.filter(r => r.id !== requestId))
      } else {
        alert(data.detail || 'Failed to reject')
      }
    } catch (error) {
      console.error('Reject error:', error)
      alert('Failed to reject - connection error')
    } finally {
      setProcessingCashIn(null)
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
  const [processingCashOut, setProcessingCashOut] = useState(null)
  const [showCashOutQR, setShowCashOutQR] = useState(null) // Track which cash-out QR to show
  
  const approveCashOut = async (requestId) => {
    const request = pendingCashOuts.find(r => r.id === requestId)
    if (!confirm(`Approve cash-out?\n\nSend ₱${request?.amount} to:\nGCash: ${request?.gcash_number}\nName: ${request?.gcash_name}`)) return
    if (processingCashOut) return
    setProcessingCashOut(requestId)
    
    try {
      const response = await fetch(`${API_URL}/cashout/approve?staff_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        setPendingCashOuts(prev => prev.filter(r => r.id !== requestId))
        const amount = data.result?.amount || 0
        const gcashNum = data.result?.gcash_number || ''
        setTimeout(() => {
          alert(`✅ Approved! Send ₱${amount.toLocaleString()} to ${gcashNum}`)
        }, 100)
      } else {
        alert(data.detail || 'Failed to approve')
      }
    } catch (error) {
      console.error('Approve cashout error:', error)
      alert('Failed to approve - connection error')
    } finally {
      setProcessingCashOut(null)
    }
  }

  const rejectCashOut = async (requestId) => {
    if (!confirm('Reject this cash-out request? Credits will be refunded to user.')) return
    if (processingCashOut) return
    setProcessingCashOut(requestId)
    
    try {
      const response = await fetch(`${API_URL}/cashout/reject?staff_id=${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId })
      })
      const data = await response.json()
      
      if (response.ok && data.success) {
        setPendingCashOuts(prev => prev.filter(r => r.id !== requestId))
        setTimeout(() => {
          alert('Cash-out rejected. Credits refunded to user.')
        }, 100)
      } else {
        alert(data.detail || 'Failed to reject')
      }
    } catch (error) {
      console.error('Reject cashout error:', error)
      alert('Failed to reject - connection error')
    } finally {
      setProcessingCashOut(null)
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
      
      // OPTIMIZED FOR AUDIO-VIDEO SYNC
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 15,
        // Live sync settings
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 2,
        // Smaller buffers for better A/V sync
        maxBufferLength: 15,
        maxMaxBufferLength: 30,
        maxBufferSize: 30 * 1000 * 1000,
        maxBufferHole: 0.5,              // Smaller gaps for better sync
        // Audio-Video sync settings
        stretchShortVideoTrack: true,    // Stretch video to match audio
        maxAudioFramesDrift: 1,          // Limit audio drift
        forceKeyFrameOnDiscontinuity: true,
        // Timeouts
        fragLoadingTimeOut: 20000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 4,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 4,
        startLevel: -1,
        autoStartLoad: true,
        progressive: true,
        startPosition: -1,
        xhrSetup: (xhr, url) => {
          xhr.withCredentials = false
        }
      })
      
      console.log('📺 Stream player: Balanced mode (smooth + reasonable latency)')
      
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
      
      // Keep stream reasonably close to live - check every 5 seconds
      let stallCount = 0
      let lastTime = 0
      const keepLive = setInterval(() => {
        if (video && hls.liveSyncPosition) {
          const currentTime = video.currentTime
          const livePosition = hls.liveSyncPosition
          const drift = livePosition - currentTime
          
          // Check if video is actually progressing
          const isProgressing = Math.abs(currentTime - lastTime) > 0.1
          lastTime = currentTime
          
          // Check if video is stalled (not progressing)
          if (!isProgressing && !video.paused) {
            stallCount++
            console.log(`⚠️ Stream may be stalling (count: ${stallCount})`)
            
            // If stalled for too long (15+ seconds), try to recover
            if (stallCount >= 3) {
              console.log('🔄 Auto-recovering stalled stream...')
              stallCount = 0
              hls.stopLoad()
              hls.startLoad()
              video.play().catch(() => {})
            }
          } else {
            stallCount = 0
          }
          
          // If more than 20 seconds behind, use playback speed to catch up (better for A/V sync)
          if (drift > 20 && isProgressing) {
            console.log(`⏩ Speeding up to catch live (${drift.toFixed(1)}s behind)`)
            video.playbackRate = 1.1 // Speed up slightly instead of jumping
          } else if (drift > 30) {
            // Only hard jump if very far behind
            console.log(`⏩ Jumping to live (was ${drift.toFixed(1)}s behind)`)
            video.playbackRate = 1.0
            video.currentTime = livePosition - 5
          } else if (video.playbackRate !== 1.0 && drift < 10) {
            // Return to normal speed when caught up
            video.playbackRate = 1.0
          }
        }
      }, 5000)
      
      // Silent recovery - don't show any overlay during buffering
      // Just let the auto-recovery handle it in the background
      
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
        if (data.data.rake_percentage !== undefined) {
          setRakePercentage(data.data.rake_percentage)
        }
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
        playSound('winner')
        speak(`${data.winner === 'meron' ? 'Meron' : data.winner === 'wala' ? 'Wala' : data.winner} wins!`)
        
        // Immediately update credits for all users who bet (winners get payout info)
        if (currentUser && data.payouts) {
          const myPayout = data.payouts.find(p => p.user_id === currentUser.id)
          if (myPayout && myPayout.new_credits !== undefined) {
            // Update with ACTUAL credits from server immediately
            const newCredits = myPayout.new_credits
            setCurrentUser(prev => {
              const updated = { ...prev, credits: newCredits }
              localStorage.setItem('sabong_user', JSON.stringify(updated))
              return updated
            })
            
            // Show notification for winners/refunds only
            if (myPayout.payout && myPayout.payout > 0) {
              setTimeout(() => {
                alert(`🎉 You won ₱${myPayout.payout.toLocaleString()}!`)
              }, 500)
            } else if (myPayout.refund && myPayout.refund > 0) {
              setTimeout(() => {
                alert(`💰 Refunded ₱${myPayout.refund.toLocaleString()}`)
              }, 500)
            }
          }
        }
        
        // Refresh all users' credits from database to ensure sync (catches losers too)
        if (currentUser && !isStaff) {
          setTimeout(() => refreshUserData(), 1000)
        }
        break
        
      case 'fight_reset':
        setFightNumber(data.fight)
        setWinner(null)
        setCountdown(null)
        speak(`Ready for fight number ${data.fight}`)
        // Refresh credits on fight reset to catch any missed updates
        if (currentUser && !isStaff) {
          refreshUserData()
        }
        break
      
      case 'fight_number_updated':
        setFightNumber(data.fight)
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
        // User: their cash-in was approved - update credits IMMEDIATELY
        if (currentUser && data.user_id === currentUser.id) {
          const newCredits = data.new_credits
          setCurrentUser(prev => {
            const updated = { ...prev, credits: newCredits }
            localStorage.setItem('sabong_user', JSON.stringify(updated))
            return updated
          })
          alert(`✅ Your cash-in of ₱${data.amount} was approved! New balance: ₱${newCredits.toLocaleString()}`)
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
        // User: their cash-out was rejected (refunded) - update credits IMMEDIATELY
        if (currentUser && data.user_id === currentUser.id) {
          const newCredits = data.new_credits
          setCurrentUser(prev => {
            const updated = { ...prev, credits: newCredits }
            localStorage.setItem('sabong_user', JSON.stringify(updated))
            return updated
          })
          alert(`Your cash-out was rejected. ₱${data.amount} has been refunded to your account.`)
        }
        break
        
      case 'credit_update':
        // Universal credit update - always update if it's for current user
        if (currentUser && data.user_id === currentUser.id && data.credits !== undefined) {
          console.log(`💰 Credit update received: ₱${data.credits} (${data.reason || 'update'})`)
          setCurrentUser(prev => {
            const updated = { ...prev, credits: data.credits }
            localStorage.setItem('sabong_user', JSON.stringify(updated))
            return updated
          })
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
  const setFightNum = (num) => apiCall('/fight/number', 'PUT', { fight_number: num })

  // Chip helper functions
  const currentBetTotal = chipStack.reduce((sum, chip) => sum + chip, 0)
  const remainingBalance = userCredit - currentBetTotal
  
  const addChip = (amount) => {
    // Check if adding this chip would exceed balance
    if (!isAdmin && currentUser && (currentBetTotal + amount) > userCredit) {
      // Can't add - would exceed balance
      return
    }
    const newStack = [...chipStack, amount]
    setChipStack(newStack)
    setBetAmount(String(newStack.reduce((sum, chip) => sum + chip, 0)))
  }
  
  const undoChip = () => {
    if (chipStack.length === 0) return
    const newStack = chipStack.slice(0, -1)
    setChipStack(newStack)
    setBetAmount(newStack.length > 0 ? String(newStack.reduce((sum, chip) => sum + chip, 0)) : '')
  }
  
  const clearChips = () => {
    setChipStack([])
    setBetAmount('')
  }
  
  // Check if a chip can be added (won't exceed balance)
  const canAddChip = (amount) => {
    if (isAdmin) return true
    if (!currentUser) return false
    return (currentBetTotal + amount) <= userCredit
  }

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
        const newCredits = data.new_credits
        setCurrentUser(prev => {
          const updated = { ...prev, credits: newCredits }
          localStorage.setItem('sabong_user', JSON.stringify(updated))
          return updated
        })
      }
      
      if (isAdmin) setBetName('')
      setBetAmount('')
      setChipStack([])
      
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
        <button className="hamburger-btn" onClick={() => setShowMobileMenu(!showMobileMenu)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
        
        <div className="header-main">
          {currentUser && !isStaff ? (
            <>
              <div className="user-credit">
                ₱{userCredit.toLocaleString()}
              </div>
              <button className="cashin-btn" onClick={openCashInModal}>
                + Cash In
              </button>
              <button className="cashout-btn" onClick={openCashOutModal}>
                - Cash Out
              </button>
            </>
          ) : currentUser ? (
            <div className="staff-badge">
              {isAdmin ? 'ADMIN' : 'CASHIER'}
            </div>
          ) : (
            <button className="login-btn-header" onClick={() => setShowAuthModal(true)}>
              Login
            </button>
          )}
        </div>
        
        {/* Mobile Menu Dropdown */}
        {showMobileMenu && (
          <div className="mobile-menu-overlay" onClick={() => setShowMobileMenu(false)}>
            <div className="mobile-menu" onClick={e => e.stopPropagation()}>
              <div className="mobile-menu-header">
                <span className="mobile-menu-title">Menu</span>
                <button className="mobile-menu-close" onClick={() => setShowMobileMenu(false)}>×</button>
              </div>
              
              <div className="mobile-menu-content">
                {/* Fight Info */}
                <div className="menu-section">
                  <div className="menu-item fight-info">
                    <span className="menu-label">Current Fight</span>
                    <span className="menu-value fight">#{fightNumber}</span>
                  </div>
                  <div className="menu-item">
                    <span className="menu-label">Connection</span>
                    <span className={`menu-value status ${connected ? 'online' : 'offline'}`}>
                      {connected ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                
                {/* User Section */}
                {currentUser && (
                  <div className="menu-section">
                    <div className="menu-item">
                      <span className="menu-label">Logged in as</span>
                      <span className="menu-value">{userName}</span>
                    </div>
                    {!isStaff && (
                      <div className="menu-item">
                        <span className="menu-label">Balance</span>
                        <span className="menu-value balance">₱{userCredit.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Actions */}
                <div className="menu-section">
                  {currentUser && !isStaff && (
                    <button className="menu-action-btn" onClick={() => { openTransactionsModal(); setShowMobileMenu(false); }}>
                      📜 Transaction History
                    </button>
                  )}
                  
                  {currentUser ? (
                    <button className="menu-action-btn logout" onClick={() => { handleLogout(); setShowMobileMenu(false); }}>
                      Logout
                    </button>
                  ) : (
                    <button className="menu-action-btn login" onClick={() => { setShowAuthModal(true); setShowMobileMenu(false); }}>
                      Login / Register
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* CASHIER DEDICATED DASHBOARD */}
      {isCashier ? (
        <main className="cashier-dashboard">
          {/* Cashier Header Stats */}
          <div className="cashier-stats">
            <div className="stat-card pending">
              <div className="stat-icon">📥</div>
              <div className="stat-info">
                <span className="stat-number">{pendingCashIns.length}</span>
                <span className="stat-label">Pending Cash-Ins</span>
              </div>
            </div>
            <div className="stat-card pending">
              <div className="stat-icon">📤</div>
              <div className="stat-info">
                <span className="stat-number">{pendingCashOuts.length}</span>
                <span className="stat-label">Pending Cash-Outs</span>
              </div>
            </div>
            <div className="stat-card total">
              <div className="stat-icon">💰</div>
              <div className="stat-info">
                <span className="stat-number">₱{pendingCashIns.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}</span>
                <span className="stat-label">Cash-In Total</span>
              </div>
            </div>
            <div className="stat-card total">
              <div className="stat-icon">💸</div>
              <div className="stat-info">
                <span className="stat-number">₱{pendingCashOuts.reduce((sum, r) => sum + r.amount, 0).toLocaleString()}</span>
                <span className="stat-label">Cash-Out Total</span>
              </div>
            </div>
          </div>

          <div className="cashier-content">
            {/* Cash-In Section */}
            <div className="cashier-section">
              <div className="section-header">
                <h2>📥 Cash-In Requests</h2>
                <span className="section-count">{pendingCashIns.length} pending</span>
              </div>
              
              {pendingCashIns.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">✅</span>
                  <p>No pending cash-in requests</p>
                </div>
              ) : (
                <div className="transaction-list">
                  {pendingCashIns.map(req => (
                    <div key={req.id} className="transaction-card cashin">
                      <div className="transaction-main">
                        <div className="transaction-user">
                          <span className="user-avatar">{req.username?.charAt(0).toUpperCase()}</span>
                          <div className="user-info">
                            <span className="user-name">{req.username}</span>
                            <span className="transaction-ref">{req.reference_code}</span>
                          </div>
                        </div>
                        <div className="transaction-amount">
                          <span className="amount">+₱{req.amount.toLocaleString()}</span>
                          <span className="time">{new Date(req.created_at).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <div className="transaction-actions">
                        <button 
                          className="action-btn approve"
                          onClick={() => approveCashIn(req.id)}
                          disabled={processingCashIn === req.id}
                        >
                          {processingCashIn === req.id ? 'Processing...' : '✓ Approve'}
                        </button>
                        <button 
                          className="action-btn reject"
                          onClick={() => rejectCashIn(req.id)}
                          disabled={processingCashIn === req.id}
                        >
                          ✗ Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cash-Out Section */}
            <div className="cashier-section">
              <div className="section-header">
                <h2>📤 Cash-Out Requests</h2>
                <span className="section-count">{pendingCashOuts.length} pending</span>
              </div>
              
              {pendingCashOuts.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">✅</span>
                  <p>No pending cash-out requests</p>
                </div>
              ) : (
                <div className="transaction-list">
                  {pendingCashOuts.map(req => (
                    <div key={req.id} className={`transaction-card cashout ${showCashOutQR === req.id ? 'expanded' : ''}`}>
                      <div className="transaction-main">
                        <div className="transaction-user">
                          <span className="user-avatar">{req.username?.charAt(0).toUpperCase()}</span>
                          <div className="user-info">
                            <span className="user-name">{req.username}</span>
                            <span className="transaction-ref">{req.reference_code}</span>
                          </div>
                        </div>
                        <div className="transaction-amount">
                          <span className="amount out">-₱{req.amount.toLocaleString()}</span>
                          <span className="gcash-num">{req.gcash_number}</span>
                        </div>
                      </div>
                      
                      <div className="transaction-actions">
                        <button 
                          className="action-btn details"
                          onClick={() => setShowCashOutQR(showCashOutQR === req.id ? null : req.id)}
                        >
                          {showCashOutQR === req.id ? '▲ Hide' : '▼ Details'}
                        </button>
                        <button 
                          className="action-btn approve"
                          onClick={() => approveCashOut(req.id)}
                          disabled={processingCashOut === req.id}
                        >
                          {processingCashOut === req.id ? 'Processing...' : '✓ Sent'}
                        </button>
                        <button 
                          className="action-btn reject"
                          onClick={() => rejectCashOut(req.id)}
                          disabled={processingCashOut === req.id}
                        >
                          ✗ Reject
                        </button>
                      </div>
                      
                      {/* Expanded Payment Details */}
                      {showCashOutQR === req.id && (
                        <div className="payment-details-panel">
                          <div className="detail-row">
                            <span className="detail-label">GCash Number</span>
                            <div className="detail-value-row">
                              <span className="detail-value highlight">{req.gcash_number}</span>
                              <button 
                                className="copy-btn small"
                                onClick={() => {
                                  navigator.clipboard.writeText(req.gcash_number)
                                  alert('📋 Copied!')
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Account Name</span>
                            <span className="detail-value">{req.gcash_name}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Amount to Send</span>
                            <div className="detail-value-row">
                              <span className="detail-value amount-highlight">₱{req.amount.toLocaleString()}</span>
                              <button 
                                className="copy-btn small"
                                onClick={() => {
                                  navigator.clipboard.writeText(req.amount.toString())
                                  alert('📋 Copied!')
                                }}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* GCash Settings Button */}
          <button 
            className="cashier-settings-btn"
            onClick={() => setShowGcashSettingsModal(true)}
          >
            ⚙️ GCash Settings
          </button>
        </main>
      ) : (
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
            <div className="panel-card stream-panel sticky-video">
              <div className="stream-header-controls">
                {/* Live Audio Control Button */}
                <button 
                  className={`audio-toggle-btn ${audioMuted ? 'muted' : 'playing'}`}
                  onClick={toggleAudio}
                  title={audioMuted ? 'Unmute' : 'Mute'}
                >
                  {audioMuted ? '🔇' : '🔊'}
                </button>
                {/* Refresh button for ALL users - helps when stream is lagging */}
                <button 
                  className="stream-refresh-btn" 
                  onClick={refreshStream}
                  title="Refresh stream if lagging"
                >
                  🔄
                </button>
                {isAdmin && (
                  <button className="stream-close-btn" onClick={() => setShowStream(false)}>✕</button>
                )}
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
                {streamStatus === 'playing' && (
                  <div 
                    className="live-indicator clickable"
                    onClick={() => {
                      // Sync to live edge when clicked - use speed up for better A/V sync
                      if (videoRef.current && hlsRef.current?.liveSyncPosition) {
                        const drift = hlsRef.current.liveSyncPosition - videoRef.current.currentTime
                        if (drift > 5) {
                          // Speed up to catch up (better for audio sync)
                          videoRef.current.playbackRate = 1.2
                          console.log(`⏩ Speeding up to sync (${drift.toFixed(1)}s behind)`)
                          // Return to normal after catching up
                          setTimeout(() => {
                            if (videoRef.current) videoRef.current.playbackRate = 1.0
                          }, Math.min(drift * 1000, 10000))
                        } else {
                          // Already close to live
                          console.log('✅ Already synced to live')
                        }
                      }
                    }}
                    title="Click to sync to live"
                  >
                    <span className="live-dot"></span> LIVE
                  </div>
                )}
                {/* Audio Indicator - just bars, no text */}
                {!audioMuted && streamStatus === 'playing' && (
                  <div className="audio-indicator">
                    <div className="audio-bars">
                      <div className="audio-bar"></div>
                      <div className="audio-bar"></div>
                      <div className="audio-bar"></div>
                    </div>
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

          {/* Betting Status Banner - Large & Obvious */}
          <div className={`betting-status-banner ${status}`}>
            <div className="status-indicator">
              <div className={`status-dot ${status}`}></div>
              <div className="status-content">
                <span className="status-label">
                  {status === 'waiting' && 'WAITING FOR NEXT FIGHT'}
                  {status === 'open' && 'BETTING IS OPEN'}
                  {status === 'lastcall' && 'LAST CALL - PLACE YOUR BETS!'}
                  {status === 'closed' && 'BETTING CLOSED'}
                  {status === 'result' && (
                    winner === 'meron' ? 'MERON WINS!' :
                    winner === 'wala' ? 'WALA WINS!' :
                    winner === 'draw' ? 'DRAW - BETS REFUNDED' :
                    winner === 'cancelled' ? 'CANCELLED - BETS REFUNDED' : 'RESULT'
                  )}
                </span>
                {countdown !== null && (
                  <span className="countdown-timer">{countdown}s</span>
                )}
              </div>
            </div>
            {(status === 'open' || status === 'lastcall') && (
              <div className="status-hint">Place your bets now!</div>
            )}
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
                <div className="delay-control fight-number-control">
                  <label>Fight #:</label>
                  <button 
                    className="fight-num-btn"
                    onClick={() => setFightNum(Math.max(1, fightNumber - 1))}
                  >
                    −
                  </button>
                  <input 
                    type="number" 
                    value={fightNumber} 
                    min="1"
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1
                      if (val >= 1) setFightNum(val)
                    }}
                  />
                  <button 
                    className="fight-num-btn"
                    onClick={() => setFightNum(fightNumber + 1)}
                  >
                    +
                  </button>
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
                        disabled={processingCashIn === req.id}
                      >
                        {processingCashIn === req.id ? '...' : '✓'}
                      </button>
                      <button 
                        className="reject-btn"
                        onClick={() => rejectCashIn(req.id)}
                        disabled={processingCashIn === req.id}
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
                  <div key={req.id} className={`cashout-request-item ${showCashOutQR === req.id ? 'expanded' : ''}`}>
                    <div className="request-info">
                      <span className="request-user">{req.username}</span>
                      <span className="request-amount out">-₱{req.amount.toLocaleString()}</span>
                      <span className="request-gcash">→ {req.gcash_number}</span>
                      <span className="request-gcash-name">{req.gcash_name}</span>
                      <span className="request-ref">{req.reference_code}</span>
                    </div>
                    <div className="request-actions">
                      <button 
                        className="details-btn"
                        onClick={() => setShowCashOutQR(showCashOutQR === req.id ? null : req.id)}
                        title="Show payment details"
                      >
                        💳
                      </button>
                      <button 
                        className="approve-btn"
                        onClick={() => approveCashOut(req.id)}
                        title="Approve & Send"
                        disabled={processingCashOut === req.id}
                      >
                        {processingCashOut === req.id ? '...' : '✓'}
                      </button>
                      <button 
                        className="reject-btn"
                        onClick={() => rejectCashOut(req.id)}
                        title="Reject & Refund"
                        disabled={processingCashOut === req.id}
                      >
                        ✗
                      </button>
                    </div>
                    {/* Payment Details Panel - Easy to copy */}
                    {showCashOutQR === req.id && (
                      <div className="cashout-qr-section">
                        <div className="qr-header">
                          <span>💸 Send ₱{req.amount.toLocaleString()}</span>
                          <button className="qr-close" onClick={() => setShowCashOutQR(null)}>×</button>
                        </div>
                        <div className="payment-details">
                          <div className="payment-row gcash-number-row">
                            <span className="label">GCash Number:</span>
                            <div className="copy-field">
                              <span className="value large">{req.gcash_number}</span>
                              <button 
                                className="copy-btn"
                                onClick={() => {
                                  navigator.clipboard.writeText(req.gcash_number)
                                  alert('📋 Number copied!')
                                }}
                              >
                                📋 Copy
                              </button>
                            </div>
                          </div>
                          <div className="payment-row">
                            <span className="label">Name:</span>
                            <span className="value">{req.gcash_name}</span>
                          </div>
                          <div className="payment-row highlight">
                            <span className="label">Amount:</span>
                            <div className="copy-field">
                              <span className="value large">₱{req.amount.toLocaleString()}</span>
                              <button 
                                className="copy-btn"
                                onClick={() => {
                                  navigator.clipboard.writeText(req.amount.toString())
                                  alert('📋 Amount copied!')
                                }}
                              >
                                📋 Copy
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="payment-instructions">
                          <p>📱 Open GCash/Bank app → Send Money → Paste number</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
              {/* Bet Amount Display */}
              <div className="bet-amount-display">
                <span className="bet-amount-value">
                  {betAmount ? `₱${parseInt(betAmount).toLocaleString()}` : '₱0'}
                </span>
                <div className="bet-display-info">
                  {chipStack.length > 0 && (
                    <span className="chip-count">{chipStack.length} chip{chipStack.length !== 1 ? 's' : ''}</span>
                  )}
                  {!isAdmin && currentUser && (
                    <span className="remaining-balance">Left: ₱{remainingBalance.toLocaleString()}</span>
                  )}
                </div>
              </div>
              
              {/* Chip Buttons */}
              <div className="chip-buttons">
                {[10, 50, 100, 500, 1000].map(amt => (
                  <button 
                    key={amt}
                    className={`chip-btn ${!canAddChip(amt) ? 'disabled' : ''}`}
                    onClick={() => addChip(amt)}
                    disabled={!canAddChip(amt)}
                  >
                    +{amt}
                  </button>
                ))}
              </div>
              
              {/* Action Buttons */}
              <div className="chip-actions">
                <button 
                  className="chip-action-btn undo"
                  onClick={undoChip}
                  disabled={chipStack.length === 0}
                >
                  ↩ Undo
                </button>
                <button 
                  className="chip-action-btn clear"
                  onClick={clearChips}
                  disabled={chipStack.length === 0}
                >
                  Clear
                </button>
                {!isAdmin && currentUser && remainingBalance >= 10 && (
                  <button 
                    className="chip-action-btn all-in"
                    onClick={() => {
                      setChipStack([...chipStack, remainingBalance])
                      setBetAmount(String(userCredit))
                    }}
                  >
                    +All
                  </button>
                )}
              </div>
            </div>
            <div className="bet-buttons">
              <button 
                className="bet-btn meron" 
                onClick={() => addBet('meron')}
                disabled={status !== 'open' && status !== 'lastcall'}
              >
                <span className="btn-side-name">MERON</span>
                {betAmount > 0 && (
                  <span className="btn-potential-win">
                    Win ₱{Math.floor(betAmount * (2 - rakePercentage / 100)).toLocaleString()}
                  </span>
                )}
              </button>
              <button 
                className="bet-btn wala" 
                onClick={() => addBet('wala')}
                disabled={status !== 'open' && status !== 'lastcall'}
              >
                <span className="btn-side-name">WALA</span>
                {betAmount > 0 && (
                  <span className="btn-potential-win">
                    Win ₱{Math.floor(betAmount * (2 - rakePercentage / 100)).toLocaleString()}
                  </span>
                )}
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

          {/* Results Board */}
          <div className="panel-card results-board">
            <div className="panel-title">📊 RESULTS</div>
            
            {/* Statistics */}
            <div className="results-stats">
              <div className="stat-item meron">
                <span className="stat-count">{history.filter(h => h.result === 'meron').length}</span>
                <span className="stat-label">MERON</span>
              </div>
              <div className="stat-item wala">
                <span className="stat-count">{history.filter(h => h.result === 'wala').length}</span>
                <span className="stat-label">WALA</span>
              </div>
              <div className="stat-item draw">
                <span className="stat-count">{history.filter(h => h.result === 'draw').length}</span>
                <span className="stat-label">DRAW</span>
              </div>
              <div className="stat-item cancelled">
                <span className="stat-count">{history.filter(h => h.result === 'cancelled').length}</span>
                <span className="stat-label">CANCEL</span>
              </div>
            </div>
            
            {/* Results Grid */}
            <div className="results-grid">
              {history.length === 0 ? (
                <p className="no-history">No results yet</p>
              ) : (
                history.slice(0, 50).map((h, i) => (
                  <div 
                    key={i} 
                    className={`result-circle ${h.result}`}
                    title={`Fight #${h.fight} - ${h.result.toUpperCase()}`}
                  >
                    {h.fight}
                  </div>
                ))
              )}
            </div>
            
            {/* Trend Road - Last 20 */}
            {history.length > 0 && (
              <div className="trend-road">
                <div className="trend-label">Recent Trend</div>
                <div className="trend-dots">
                  {history.slice(0, 20).map((h, i) => (
                    <div 
                      key={i} 
                      className={`trend-dot ${h.result}`}
                      title={`#${h.fight}`}
                    ></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      )}

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
