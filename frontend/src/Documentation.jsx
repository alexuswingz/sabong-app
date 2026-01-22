import { useState } from 'react'
import './Documentation.css'

function Documentation() {
  const [activeSection, setActiveSection] = useState('overview')
  
  const sections = [
    { id: 'overview', label: 'Overview', icon: '🏠' },
    { id: 'features', label: 'Features', icon: '✨' },
    { id: 'user-guide', label: 'User Guide', icon: '👤' },
    { id: 'admin', label: 'Admin Panel', icon: '🔒' },
    { id: 'cashier', label: 'Cashier System', icon: '💳' },
    { id: 'support', label: 'Support Center', icon: '💬' },
    { id: 'technical', label: 'Technical', icon: '⚙️' },
    { id: 'security', label: 'Security', icon: '🛡️' },
  ]

  return (
    <div className="documentation">
      {/* Header */}
      <header className="doc-header">
        <div className="doc-header-content">
          <div className="doc-logo">
            <span className="logo-icon">🐓</span>
            <div className="logo-text">
              <h1>Sabong Arena</h1>
              <span className="tagline">Live Betting Platform</span>
            </div>
          </div>
          <a href="/" className="back-to-app">← Back to App</a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="doc-hero">
        <div className="hero-content">
          <span className="hero-badge">Enterprise Solution</span>
          <h1>Complete Sabong Betting Platform</h1>
          <p>
            A modern, real-time cockfighting betting system with live streaming, 
            secure transactions, multi-role management, and 24/7 customer support.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="stat-value">Real-Time</span>
              <span className="stat-label">Live Updates</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">4 Roles</span>
              <span className="stat-label">User Types</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">Mobile</span>
              <span className="stat-label">Responsive</span>
            </div>
            <div className="hero-stat">
              <span className="stat-value">Secure</span>
              <span className="stat-label">Transactions</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="doc-main">
        {/* Sidebar Navigation */}
        <nav className="doc-sidebar">
          <div className="sidebar-title">Documentation</div>
          <ul className="nav-list">
            {sections.map(section => (
              <li key={section.id}>
                <button 
                  className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <span className="nav-icon">{section.icon}</span>
                  <span>{section.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content Area */}
        <main className="doc-content">
          {/* Overview Section */}
          {activeSection === 'overview' && (
            <div className="content-section">
              <h2>Platform Overview</h2>
              <p className="section-intro">
                Sabong Arena is a comprehensive live betting platform designed specifically for 
                cockfighting entertainment. Built with modern web technologies, it provides a 
                seamless experience for bettors, operators, and support staff.
              </p>

              <div className="feature-grid">
                <div className="feature-card">
                  <div className="feature-icon">📺</div>
                  <h3>Live Streaming</h3>
                  <p>HLS-powered live video streaming with low latency and automatic quality adjustment.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">⚡</div>
                  <h3>Real-Time Betting</h3>
                  <p>WebSocket-powered instant bet placement and updates with sub-second latency.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">💰</div>
                  <h3>Secure Payments</h3>
                  <p>GCash integration for seamless cash-in and cash-out with transaction tracking.</p>
                </div>
                <div className="feature-card">
                  <div className="feature-icon">📱</div>
                  <h3>Mobile First</h3>
                  <p>Fully responsive design optimized for smartphones and tablets.</p>
                </div>
              </div>

              <h3>System Architecture</h3>
              <div className="architecture-diagram">
                <div className="arch-layer">
                  <div className="arch-title">Frontend</div>
                  <div className="arch-items">
                    <span>React 18</span>
                    <span>WebSocket Client</span>
                    <span>HLS.js Player</span>
                  </div>
                </div>
                <div className="arch-arrow">↕</div>
                <div className="arch-layer">
                  <div className="arch-title">Backend</div>
                  <div className="arch-items">
                    <span>FastAPI</span>
                    <span>WebSocket Server</span>
                    <span>Stream Proxy</span>
                  </div>
                </div>
                <div className="arch-arrow">↕</div>
                <div className="arch-layer">
                  <div className="arch-title">Database</div>
                  <div className="arch-items">
                    <span>PostgreSQL</span>
                    <span>User Management</span>
                    <span>Transaction Records</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Features Section */}
          {activeSection === 'features' && (
            <div className="content-section">
              <h2>Complete Feature List</h2>
              
              <div className="features-category">
                <h3>🎮 Betting Features</h3>
                <ul className="feature-list">
                  <li><span className="check">✓</span> Real-time odds display (Meron vs Wala)</li>
                  <li><span className="check">✓</span> Quick bet chip buttons (10, 50, 100, 500, 1000)</li>
                  <li><span className="check">✓</span> Bet undo and clear functionality</li>
                  <li><span className="check">✓</span> All-in betting option</li>
                  <li><span className="check">✓</span> Live bet tracking per fight</li>
                  <li><span className="check">✓</span> Automatic payout calculation</li>
                  <li><span className="check">✓</span> Configurable rake/commission system</li>
                  <li><span className="check">✓</span> Draw and cancelled fight handling</li>
                </ul>
              </div>

              <div className="features-category">
                <h3>📺 Live Streaming</h3>
                <ul className="feature-list">
                  <li><span className="check">✓</span> HLS adaptive streaming</li>
                  <li><span className="check">✓</span> Auto-recovery on stream issues</li>
                  <li><span className="check">✓</span> Audio/video sync optimization</li>
                  <li><span className="check">✓</span> One-click stream refresh</li>
                  <li><span className="check">✓</span> Mute/unmute controls</li>
                  <li><span className="check">✓</span> Live indicator with sync-to-live</li>
                  <li><span className="check">✓</span> Stream proxy for authentication</li>
                </ul>
              </div>

              <div className="features-category">
                <h3>💳 Payment System</h3>
                <ul className="feature-list">
                  <li><span className="check">✓</span> GCash cash-in with QR code</li>
                  <li><span className="check">✓</span> Cash-out to GCash</li>
                  <li><span className="check">✓</span> Reference code tracking</li>
                  <li><span className="check">✓</span> Transaction history</li>
                  <li><span className="check">✓</span> Admin approval workflow</li>
                  <li><span className="check">✓</span> Instant credit updates</li>
                  <li><span className="check">✓</span> Copy-to-clipboard for payment details</li>
                </ul>
              </div>

              <div className="features-category">
                <h3>💬 Support System</h3>
                <ul className="feature-list">
                  <li><span className="check">✓</span> Real-time chat support</li>
                  <li><span className="check">✓</span> Typing indicators</li>
                  <li><span className="check">✓</span> Ticket management</li>
                  <li><span className="check">✓</span> Dedicated support agent role</li>
                  <li><span className="check">✓</span> Message history persistence</li>
                  <li><span className="check">✓</span> Sound notifications</li>
                </ul>
              </div>

              <div className="features-category">
                <h3>📊 Analytics & History</h3>
                <ul className="feature-list">
                  <li><span className="check">✓</span> Fight results history</li>
                  <li><span className="check">✓</span> Trend visualization</li>
                  <li><span className="check">✓</span> Meron/Wala/Draw statistics</li>
                  <li><span className="check">✓</span> Personal bet history</li>
                  <li><span className="check">✓</span> Transaction records</li>
                </ul>
              </div>
            </div>
          )}

          {/* User Guide Section */}
          {activeSection === 'user-guide' && (
            <div className="content-section">
              <h2>User Guide</h2>
              <p className="section-intro">
                How regular users interact with the platform to place bets and manage their accounts.
              </p>

              <div className="guide-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <h3>Registration & Login</h3>
                  <p>New users can register with a username and password. New accounts start with ₱1,000 bonus credits for testing.</p>
                  <div className="step-screenshot">
                    <div className="mock-ui">
                      <div className="mock-input">Username</div>
                      <div className="mock-input">Password</div>
                      <div className="mock-btn">Register</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="guide-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <h3>Cash In Credits</h3>
                  <p>Users can add credits by scanning the GCash QR code and sending payment with the reference code.</p>
                  <ul>
                    <li>Click "Cash In" button</li>
                    <li>Enter amount (₱100 - ₱50,000)</li>
                    <li>Scan QR code with GCash app</li>
                    <li>Send payment with reference code</li>
                    <li>Wait for admin approval</li>
                  </ul>
                </div>
              </div>

              <div className="guide-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <h3>Placing Bets</h3>
                  <p>When betting is open, users can place bets on either Meron (red) or Wala (blue).</p>
                  <ul>
                    <li>Watch the live stream</li>
                    <li>Use chip buttons to build bet amount</li>
                    <li>Click MERON or WALA to place bet</li>
                    <li>Credits are deducted immediately</li>
                    <li>Winnings are credited automatically</li>
                  </ul>
                </div>
              </div>

              <div className="guide-step">
                <div className="step-number">4</div>
                <div className="step-content">
                  <h3>Cash Out Winnings</h3>
                  <p>Users can withdraw their credits to their GCash account.</p>
                  <ul>
                    <li>Click "Cash Out" button</li>
                    <li>Enter amount and GCash details</li>
                    <li>Submit request</li>
                    <li>Credits are deducted pending approval</li>
                    <li>Receive GCash payment after approval</li>
                  </ul>
                </div>
              </div>

              <div className="guide-step">
                <div className="step-number">5</div>
                <div className="step-content">
                  <h3>Getting Support</h3>
                  <p>Users can get help anytime through the real-time support chat.</p>
                  <ul>
                    <li>Click the 💬 button (bottom-right)</li>
                    <li>Type your question or issue</li>
                    <li>Get instant responses from support team</li>
                    <li>See typing indicators when staff is replying</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Admin Section */}
          {activeSection === 'admin' && (
            <div className="content-section">
              <h2>Admin Panel</h2>
              <p className="section-intro">
                The admin has full control over the platform including fight management, 
                user management, and system settings.
              </p>

              <div className="credentials-box">
                <h4>Default Admin Credentials</h4>
                <div className="credential">
                  <span className="label">Username:</span>
                  <code>admin</code>
                </div>
                <div className="credential">
                  <span className="label">Password:</span>
                  <code>admin123</code>
                </div>
              </div>

              <h3>Declarator Controls</h3>
              <p>The admin controls the entire betting flow:</p>
              
              <div className="control-flow">
                <div className="flow-step">
                  <div className="flow-icon green">🟢</div>
                  <div className="flow-label">Open Betting</div>
                  <div className="flow-key">Key: O</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon yellow">⚠️</div>
                  <div className="flow-label">Last Call</div>
                  <div className="flow-key">Key: L</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon red">🔴</div>
                  <div className="flow-label">Close Betting</div>
                  <div className="flow-key">Key: C</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon gold">🏆</div>
                  <div className="flow-label">Declare Winner</div>
                  <div className="flow-key">M/W/D</div>
                </div>
                <div className="flow-arrow">→</div>
                <div className="flow-step">
                  <div className="flow-icon blue">🔄</div>
                  <div className="flow-label">Reset Fight</div>
                  <div className="flow-key">Key: R</div>
                </div>
              </div>

              <h3>Admin Capabilities</h3>
              <div className="capability-grid">
                <div className="capability-item">
                  <h4>Fight Management</h4>
                  <ul>
                    <li>Set fight number</li>
                    <li>Configure stream delay</li>
                    <li>Set last call countdown</li>
                    <li>Declare winners (Meron/Wala/Draw)</li>
                    <li>Cancel fights with refunds</li>
                  </ul>
                </div>
                <div className="capability-item">
                  <h4>Transaction Approval</h4>
                  <ul>
                    <li>View pending cash-ins</li>
                    <li>Approve/reject deposits</li>
                    <li>Process cash-outs</li>
                    <li>Refund on rejection</li>
                  </ul>
                </div>
                <div className="capability-item">
                  <h4>System Settings</h4>
                  <ul>
                    <li>GCash account settings</li>
                    <li>Stream cookie management</li>
                    <li>Rake percentage config</li>
                    <li>Sound effects toggle</li>
                  </ul>
                </div>
                <div className="capability-item">
                  <h4>Support & Users</h4>
                  <ul>
                    <li>View all bets</li>
                    <li>Handle support tickets</li>
                    <li>Monitor connected users</li>
                    <li>View all transactions</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Cashier Section */}
          {activeSection === 'cashier' && (
            <div className="content-section">
              <h2>Cashier System</h2>
              <p className="section-intro">
                Cashiers have a dedicated dashboard focused on processing financial transactions 
                efficiently without access to betting controls.
              </p>

              <div className="credentials-box">
                <h4>Default Cashier Credentials</h4>
                <div className="credential">
                  <span className="label">Username:</span>
                  <code>cashier</code>
                </div>
                <div className="credential">
                  <span className="label">Password:</span>
                  <code>cashier123</code>
                </div>
              </div>

              <h3>Cashier Dashboard</h3>
              <div className="dashboard-preview">
                <div className="preview-stats">
                  <div className="preview-stat">
                    <span className="preview-icon">📥</span>
                    <span className="preview-label">Pending Cash-Ins</span>
                  </div>
                  <div className="preview-stat">
                    <span className="preview-icon">📤</span>
                    <span className="preview-label">Pending Cash-Outs</span>
                  </div>
                  <div className="preview-stat">
                    <span className="preview-icon">💰</span>
                    <span className="preview-label">Cash-In Total</span>
                  </div>
                  <div className="preview-stat">
                    <span className="preview-icon">💸</span>
                    <span className="preview-label">Cash-Out Total</span>
                  </div>
                </div>
              </div>

              <h3>Processing Cash-Ins</h3>
              <ol className="process-steps">
                <li>User submits cash-in request with reference code</li>
                <li>User sends GCash payment with reference</li>
                <li>Cashier sees pending request in dashboard</li>
                <li>Cashier verifies payment received</li>
                <li>Click ✓ Approve to credit user instantly</li>
                <li>Or click ✗ Reject if payment not verified</li>
              </ol>

              <h3>Processing Cash-Outs</h3>
              <ol className="process-steps">
                <li>User submits cash-out request</li>
                <li>Credits deducted immediately (pending)</li>
                <li>Cashier sees request with GCash details</li>
                <li>Click "Details" to see payment info</li>
                <li>Copy GCash number and send payment</li>
                <li>Click ✓ Sent to complete</li>
                <li>Or ✗ Reject to refund user</li>
              </ol>

              <div className="info-box">
                <h4>💡 Pro Tips for Cashiers</h4>
                <ul>
                  <li>Always verify reference codes before approving</li>
                  <li>Use the Copy button to avoid typing errors</li>
                  <li>Process requests in order (FIFO)</li>
                  <li>Keep GCash app ready for quick processing</li>
                </ul>
              </div>
            </div>
          )}

          {/* Support Section */}
          {activeSection === 'support' && (
            <div className="content-section">
              <h2>Support Center</h2>
              <p className="section-intro">
                Dedicated support agents can handle customer inquiries in real-time through the 
                integrated chat system.
              </p>

              <div className="credentials-box">
                <h4>Default Support Agent Credentials</h4>
                <div className="credential">
                  <span className="label">Username:</span>
                  <code>support</code>
                </div>
                <div className="credential">
                  <span className="label">Password:</span>
                  <code>support123</code>
                </div>
              </div>

              <h3>Support Agent Dashboard</h3>
              <p>Support agents see a focused interface with:</p>
              <ul className="feature-list">
                <li><span className="check">✓</span> Online/offline status indicator</li>
                <li><span className="check">✓</span> Open tickets counter</li>
                <li><span className="check">✓</span> Active chats counter</li>
                <li><span className="check">✓</span> Ticket list with user names and previews</li>
                <li><span className="check">✓</span> Full chat panel for conversations</li>
              </ul>

              <h3>Real-Time Features</h3>
              <div className="realtime-features">
                <div className="rt-feature">
                  <div className="rt-icon">⚡</div>
                  <h4>Instant Messages</h4>
                  <p>Messages appear immediately via WebSocket - no polling or refresh needed.</p>
                </div>
                <div className="rt-feature">
                  <div className="rt-icon">✍️</div>
                  <h4>Typing Indicators</h4>
                  <p>See when users are typing to prepare responses proactively.</p>
                </div>
                <div className="rt-feature">
                  <div className="rt-icon">🔔</div>
                  <h4>Sound Alerts</h4>
                  <p>Audio notifications for new messages ensure nothing is missed.</p>
                </div>
                <div className="rt-feature">
                  <div className="rt-icon">📋</div>
                  <h4>Ticket Management</h4>
                  <p>Close resolved tickets to keep the queue organized.</p>
                </div>
              </div>

              <h3>Support Workflow</h3>
              <ol className="process-steps">
                <li>User clicks 💬 button to open support chat</li>
                <li>User sends message (ticket auto-created)</li>
                <li>Support agent sees new ticket in list</li>
                <li>Agent clicks ticket to open chat</li>
                <li>Real-time conversation begins</li>
                <li>Agent closes ticket when resolved</li>
              </ol>
            </div>
          )}

          {/* Technical Section */}
          {activeSection === 'technical' && (
            <div className="content-section">
              <h2>Technical Specifications</h2>
              
              <h3>Technology Stack</h3>
              <div className="tech-grid">
                <div className="tech-item">
                  <div className="tech-category">Frontend</div>
                  <ul>
                    <li>React 18 with Hooks</li>
                    <li>Vite build tool</li>
                    <li>HLS.js for streaming</li>
                    <li>Native WebSocket</li>
                    <li>CSS3 with CSS Variables</li>
                  </ul>
                </div>
                <div className="tech-item">
                  <div className="tech-category">Backend</div>
                  <ul>
                    <li>Python 3.12+</li>
                    <li>FastAPI framework</li>
                    <li>WebSocket (native)</li>
                    <li>asyncpg for PostgreSQL</li>
                    <li>Playwright for automation</li>
                  </ul>
                </div>
                <div className="tech-item">
                  <div className="tech-category">Database</div>
                  <ul>
                    <li>PostgreSQL 14+</li>
                    <li>Connection pooling</li>
                    <li>In-memory mode for dev</li>
                    <li>Automatic migrations</li>
                  </ul>
                </div>
                <div className="tech-item">
                  <div className="tech-category">Deployment</div>
                  <ul>
                    <li>Railway.app ready</li>
                    <li>Vercel compatible</li>
                    <li>Docker support</li>
                    <li>Environment config</li>
                  </ul>
                </div>
              </div>

              <h3>API Endpoints</h3>
              <div className="api-list">
                <div className="api-group">
                  <h4>Authentication</h4>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/auth/register</code>
                    <span className="desc">Register new user</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/auth/login</code>
                    <span className="desc">User login</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method get">GET</span>
                    <code>/auth/user/{'{id}'}</code>
                    <span className="desc">Get user data</span>
                  </div>
                </div>
                <div className="api-group">
                  <h4>Betting</h4>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/betting/add</code>
                    <span className="desc">Place a bet</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/betting/open</code>
                    <span className="desc">Open betting</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/fight/declare-winner</code>
                    <span className="desc">Declare winner</span>
                  </div>
                </div>
                <div className="api-group">
                  <h4>Transactions</h4>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/cashin/request</code>
                    <span className="desc">Request cash-in</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/cashin/approve</code>
                    <span className="desc">Approve cash-in</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/cashout/request</code>
                    <span className="desc">Request cash-out</span>
                  </div>
                </div>
                <div className="api-group">
                  <h4>Support</h4>
                  <div className="api-endpoint">
                    <span className="method get">GET</span>
                    <code>/support/ticket</code>
                    <span className="desc">Get/create ticket</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method post">POST</span>
                    <code>/support/send</code>
                    <span className="desc">Send message</span>
                  </div>
                  <div className="api-endpoint">
                    <span className="method ws">WS</span>
                    <code>/ws</code>
                    <span className="desc">WebSocket connection</span>
                  </div>
                </div>
              </div>

              <h3>WebSocket Events</h3>
              <div className="ws-events">
                <div className="ws-event">
                  <code>state_update</code>
                  <span>Fight state, bets, status</span>
                </div>
                <div className="ws-event">
                  <code>betting_status</code>
                  <span>Open/close/lastcall</span>
                </div>
                <div className="ws-event">
                  <code>winner_declared</code>
                  <span>Winner + payouts</span>
                </div>
                <div className="ws-event">
                  <code>credit_update</code>
                  <span>User credit changes</span>
                </div>
                <div className="ws-event">
                  <code>support_message</code>
                  <span>Chat messages</span>
                </div>
                <div className="ws-event">
                  <code>support_typing</code>
                  <span>Typing indicators</span>
                </div>
              </div>
            </div>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <div className="content-section">
              <h2>Security Features</h2>
              <p className="section-intro">
                The platform implements multiple layers of security to protect users and prevent fraud.
              </p>

              <div className="security-grid">
                <div className="security-item">
                  <div className="security-icon">🔐</div>
                  <h3>Password Security</h3>
                  <p>All passwords are hashed using bcrypt with salt. Plain-text passwords are never stored.</p>
                </div>
                <div className="security-item">
                  <div className="security-icon">💰</div>
                  <h3>Server-Side Validation</h3>
                  <p>All credit operations are validated server-side. Client cannot manipulate balances.</p>
                </div>
                <div className="security-item">
                  <div className="security-icon">⏱️</div>
                  <h3>Rate Limiting</h3>
                  <p>Bet placement is rate-limited to prevent spam and exploitation.</p>
                </div>
                <div className="security-item">
                  <div className="security-icon">🔒</div>
                  <h3>Role-Based Access</h3>
                  <p>Four distinct roles (User, Cashier, Support, Admin) with appropriate permissions.</p>
                </div>
                <div className="security-item">
                  <div className="security-icon">🛡️</div>
                  <h3>Anti-Cheat Measures</h3>
                  <ul>
                    <li>Bets cannot be cancelled after placement</li>
                    <li>Credits checked from database, not client</li>
                    <li>Dev tools detection in production</li>
                    <li>Right-click disabled in production</li>
                  </ul>
                </div>
                <div className="security-item">
                  <div className="security-icon">📝</div>
                  <h3>Transaction Tracking</h3>
                  <p>All cash-in/out requests have unique reference codes and full audit trail.</p>
                </div>
              </div>

              <h3>Role Permissions Matrix</h3>
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>User</th>
                    <th>Cashier</th>
                    <th>Support</th>
                    <th>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Watch Stream</td>
                    <td className="yes">✓</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                  </tr>
                  <tr>
                    <td>Place Bets</td>
                    <td className="yes">✓</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                  </tr>
                  <tr>
                    <td>Cash In/Out</td>
                    <td className="yes">✓</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                  </tr>
                  <tr>
                    <td>Process Transactions</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                  </tr>
                  <tr>
                    <td>Handle Support</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                    <td className="yes">✓</td>
                    <td className="yes">✓</td>
                  </tr>
                  <tr>
                    <td>Declare Winners</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                  </tr>
                  <tr>
                    <td>System Settings</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="no">—</td>
                    <td className="yes">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="doc-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="logo-icon">🐓</span>
            <span>Sabong Arena</span>
          </div>
          <p>Professional Live Betting Platform</p>
          <p className="copyright">© 2024 All Rights Reserved</p>
        </div>
      </footer>
    </div>
  )
}

export default Documentation
