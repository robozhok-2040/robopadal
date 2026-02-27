import { useEffect, useMemo, useState } from 'react'

type Player = {
  id: number
  name: string
}

type Team = {
  id: string
  players: [number, number]
}

type Match = {
  id: string
  round: number
  court: number
  teamA: Team
  teamB: Team
  scoreA: number | null
}

type Session = {
  name: string
  players: Player[]
  matches: Match[]
  courtSwapByRound: Record<number, boolean>
}

type StandingsRow = {
  player: Player
  points: number
  matchesPlayed: number
}

const STORAGE_KEY = 'robopadal-americano-session'
const TOTAL_POINTS_KEY = 'robopadal-americano-total-points'

const dateLabel = () => {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = now.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const defaultSessionName = `Americano ${dateLabel()}`

const pairingsByRound: [number, number][][] = [
  [[0, 7], [1, 6], [2, 5], [3, 4]],
  [[0, 6], [7, 5], [1, 4], [2, 3]],
  [[0, 5], [6, 4], [7, 3], [1, 2]],
  [[0, 4], [5, 3], [6, 2], [7, 1]],
  [[0, 3], [4, 2], [5, 1], [6, 7]],
  [[0, 2], [3, 1], [4, 7], [5, 6]],
  [[0, 1], [2, 7], [3, 6], [4, 5]]
]

const generateMatches = (): Match[] => {
  const matches: Match[] = []

  pairingsByRound.forEach((roundPairings, roundIdx) => {
    const teams = roundPairings.map((pair, teamIdx) => ({
      id: `r${roundIdx + 1}t${teamIdx + 1}`,
      players: [pair[0], pair[1]] as [number, number]
    }))

    matches.push({
      id: `r${roundIdx + 1}c1`,
      round: roundIdx + 1,
      court: 1,
      teamA: teams[0],
      teamB: teams[1],
      scoreA: null
    })

    matches.push({
      id: `r${roundIdx + 1}c2`,
      round: roundIdx + 1,
      court: 2,
      teamA: teams[2],
      teamB: teams[3],
      scoreA: null
    })
  })

  return matches
}

const initialPlayerInputs = Array.from({ length: 8 }, () => '')
const TOTAL_ROUNDS = 7

const normalizeSession = (parsed: Session): Session => ({
  ...parsed,
  courtSwapByRound: parsed.courtSwapByRound ?? {}
})

function App() {
  const [totalPoints, setTotalPoints] = useState<24 | 32>(32)
  const [session, setSession] = useState<Session | null>(null)
  const [sessionNameInput, setSessionNameInput] = useState(defaultSessionName)
  const [playerInputs, setPlayerInputs] = useState<string[]>(initialPlayerInputs)
  const [activeTab, setActiveTab] = useState<'matches' | 'standings'>('matches')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const storedTotalPoints = localStorage.getItem(TOTAL_POINTS_KEY)
    if (storedTotalPoints === '24' || storedTotalPoints === '32') {
      setTotalPoints(Number(storedTotalPoints) as 24 | 32)
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    try {
      const parsed = JSON.parse(stored) as Session
      if (parsed?.players?.length === 8 && parsed?.matches?.length === 14) {
        setSession(normalizeSession(parsed))
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  const persistSession = (next: Session) => {
    setSession(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const updateTotalPoints = (nextTotalPoints: 24 | 32) => {
    setTotalPoints(nextTotalPoints)
    localStorage.setItem(TOTAL_POINTS_KEY, String(nextTotalPoints))

    if (!session) return

    const next: Session = {
      ...session,
      matches: session.matches.map((match) => {
        if (match.scoreA === null) return match
        return {
          ...match,
          scoreA: Math.max(0, Math.min(nextTotalPoints, match.scoreA))
        }
      })
    }

    persistSession(next)
  }

  const standings = useMemo<StandingsRow[]>(() => {
    if (!session) return []

    const totals = new Map<number, { points: number; matchesPlayed: number }>()
    session.players.forEach((player) => totals.set(player.id, { points: 0, matchesPlayed: 0 }))

    session.matches.forEach((match) => {
      if (match.scoreA === null) return
      const scoreA = match.scoreA
      const scoreB = totalPoints - scoreA

      match.teamA.players.forEach((playerId) => {
        const row = totals.get(playerId)
        if (!row) return
        row.points += scoreA
        row.matchesPlayed += 1
      })

      match.teamB.players.forEach((playerId) => {
        const row = totals.get(playerId)
        if (!row) return
        row.points += scoreB
        row.matchesPlayed += 1
      })
    })

    return session.players
      .map((player) => ({ player, ...totals.get(player.id)! }))
      .sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name))
  }, [session, totalPoints])

  const groupedMatches = useMemo(() => {
    if (!session) return [] as Match[][]
    return Array.from({ length: TOTAL_ROUNDS }, (_, idx) => {
      const round = idx + 1
      const isSwapped = !!session.courtSwapByRound[round]
      const roundMatches = session.matches
        .filter((match) => match.round === round)
        .sort((a, b) => a.court - b.court)

      return isSwapped ? [roundMatches[1], roundMatches[0]] : roundMatches
    })
  }, [session])

  const createSession = () => {
    const names = playerInputs.map((name) => name.trim())
    const hasInvalid = names.some((name) => !name)

    if (hasInvalid) {
      setMessage('Please enter exactly 8 player names.')
      return
    }

    const unique = new Set(names.map((name) => name.toLowerCase()))
    if (unique.size !== 8) {
      setMessage('Player names must be unique.')
      return
    }

    const players = names.map((name, id) => ({ id, name }))
    const nextSession: Session = {
      name: sessionNameInput.trim() || defaultSessionName,
      players,
      matches: generateMatches(),
      courtSwapByRound: {}
    }

    persistSession(nextSession)
    setMessage('')
  }

  const toggleCourtSwap = (round: number) => {
    if (!session) return

    const next: Session = {
      ...session,
      courtSwapByRound: {
        ...session.courtSwapByRound,
        [round]: !session.courtSwapByRound[round]
      }
    }

    persistSession(next)
  }

  const getPlayerName = (playerId: number) => {
    if (!session) return ''
    return session.players[playerId]?.name ?? ''
  }

  const updateScore = (matchId: string, scoreA: number) => {
    if (!session) return
    const clamped = Math.max(0, Math.min(totalPoints, scoreA))
    const next: Session = {
      ...session,
      matches: session.matches.map((match) =>
        match.id === matchId ? { ...match, scoreA: clamped } : match
      )
    }
    persistSession(next)
  }

  const resetSession = () => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
    setSessionNameInput(defaultSessionName)
    setPlayerInputs(initialPlayerInputs)
    setActiveTab('matches')
    setMessage('Session reset.')
  }

  const buildSummary = () => {
    if (!session) return ''

    const lines: string[] = []
    lines.push(session.name)
    lines.push('')
    lines.push('Standings:')
    standings.forEach((row, idx) => {
      lines.push(`${idx + 1}. ${row.player.name} - ${row.points} pts (${row.matchesPlayed} matches)`) 
    })

    lines.push('')
    lines.push('Matches:')
    groupedMatches.forEach((roundMatches, idx) => {
      lines.push(`Round ${idx + 1}`)
      roundMatches.forEach((match, matchIdx) => {
        const teamAName = `${getPlayerName(match.teamA.players[0])} / ${getPlayerName(match.teamA.players[1])}`
        const teamBName = `${getPlayerName(match.teamB.players[0])} / ${getPlayerName(match.teamB.players[1])}`
        const score = match.scoreA === null ? 'No score' : `${match.scoreA}-${totalPoints - match.scoreA}`
        lines.push(`  Court ${matchIdx + 1}: ${teamAName} vs ${teamBName} (${score})`)
      })
    })

    return lines.join('\n')
  }

  const shareSummary = async () => {
    if (!session) return
    const text = buildSummary()

    try {
      if (navigator.share) {
        await navigator.share({
          title: session.name,
          text
        })
        setMessage('Shared successfully.')
        return
      }

      await navigator.clipboard.writeText(text)
      setMessage('Summary copied to clipboard.')
    } catch {
      setMessage('Unable to share or copy. Please copy manually.')
    }
  }

  const totalPointsSelector = (
    <section className="card total-points-card">
      <span className="label">Сума очок за матч</span>
      <div className="row total-points-row">
        <button
          className={`button ${totalPoints === 32 ? '' : 'button-secondary'}`}
          onClick={() => updateTotalPoints(32)}
        >
          32 (за замовчуванням)
        </button>
        <button
          className={`button ${totalPoints === 24 ? '' : 'button-secondary'}`}
          onClick={() => updateTotalPoints(24)}
        >
          24
        </button>
      </div>
    </section>
  )

  if (!session) {
    return (
      <main className="container">
        <h1>Padel Americano</h1>
        <p className="sub">8 players · 2 courts · 7 rounds</p>

        {totalPointsSelector}

        <section className="card">
          <label className="label" htmlFor="sessionName">Session name</label>
          <input
            id="sessionName"
            value={sessionNameInput}
            onChange={(e) => setSessionNameInput(e.target.value)}
            className="input"
          />

          <h2>Players</h2>
          <p className="hint">Enter exactly 8 unique names.</p>
          <div className="players-grid">
            {playerInputs.map((name, idx) => (
              <input
                key={idx}
                value={name}
                onChange={(e) => {
                  const next = [...playerInputs]
                  next[idx] = e.target.value
                  setPlayerInputs(next)
                }}
                placeholder={`Player ${idx + 1}`}
                className="input"
              />
            ))}
          </div>

          <button className="button" onClick={createSession}>Create session</button>
          {message && <p className="message">{message}</p>}
        </section>
      </main>
    )
  }

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1>{session.name}</h1>
          <p className="sub">Padel Americano</p>
        </div>
        <button className="button button-secondary" onClick={resetSession}>Reset</button>
      </header>

      {totalPointsSelector}

      <div className="row">
        <button
          className={`button ${activeTab === 'matches' ? '' : 'button-secondary'}`}
          onClick={() => setActiveTab('matches')}
        >
          Matches
        </button>
        <button
          className={`button ${activeTab === 'standings' ? '' : 'button-secondary'}`}
          onClick={() => setActiveTab('standings')}
        >
          Standings
        </button>
        <button className="button button-secondary" onClick={shareSummary}>Share/Copy</button>
      </div>

      {activeTab === 'matches' && (
        <section className="stack">
          {groupedMatches.map((roundMatches, idx) => (
            <article className="card" key={idx}>
              <div className="round-header">
                <h2>Round {idx + 1}</h2>
                <div className="round-controls">
                  <button
                    className="button button-secondary button-small"
                    onClick={() => toggleCourtSwap(idx + 1)}
                  >
                    Поміняти корти
                  </button>
                  <span className="hint-inline">
                    (зараз: {session.courtSwapByRound[idx + 1] ? 'поміняно' : 'стандарт'})
                  </span>
                </div>
              </div>
              {roundMatches.map((match, matchIdx) => {
                const scoreA = match.scoreA ?? ''
                const scoreB = match.scoreA === null ? totalPoints : totalPoints - match.scoreA
                return (
                  <div key={match.id} className="match">
                    <div className="match-main">
                      <strong>Court {matchIdx + 1}</strong>
                      <p>
                        {getPlayerName(match.teamA.players[0])} / {getPlayerName(match.teamA.players[1])}
                        {' '}vs{' '}
                        {getPlayerName(match.teamB.players[0])} / {getPlayerName(match.teamB.players[1])}
                      </p>
                    </div>
                    <div className="score-entry">
                      <label htmlFor={match.id}>Enter score</label>
                      <div className="score-row">
                        <input
                          id={match.id}
                          type="number"
                          min={0}
                          max={totalPoints}
                          value={scoreA}
                          className="input score-input no-spin"
                          onChange={(e) => {
                            const value = Number(e.target.value)
                            if (Number.isNaN(value)) return
                            updateScore(match.id, value)
                          }}
                        />
                        <span className="score-separator">:</span>
                        <output>{scoreB}</output>
                      </div>
                    </div>
                  </div>
                )
              })}
            </article>
          ))}
        </section>
      )}

      {activeTab === 'standings' && (
        <section className="card">
          <h2>Standings</h2>
          <ol className="standings">
            {standings.map((row) => (
              <li key={row.player.id} className="standing-item">
                <span>{row.player.name}</span>
                <span>{row.points} pts · {row.matchesPlayed} matches</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {message && <p className="message">{message}</p>}
    </main>
  )
}

export default App
