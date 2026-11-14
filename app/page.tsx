'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Activity, AlertTriangle, Check, ChevronRight, CircleDot, Gem, Mountain, Radio, Rocket, Shield, Snowflake, Sun, UserRound, Zap, Drill, X, Flame } from 'lucide-react'

type Tile = 'SUN' | 'SHADOW' | 'WALL' | 'CORE' | 'LANDER'
type Command = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'DRILL CORE' | 'HEATER BOOST' | 'RAD-SHIELD'
type Status = 'BRIEFING' | 'IDLE' | 'TRANSMITTING' | 'EXECUTING' | 'WON' | 'LOST'
type Level = { name: string; delay: number; flare: number; grid: Tile[][]; start: [number, number]; core: [number, number]; intro: string }

const makeMap = (walls: [number, number][], shadows: [number, number][], start: [number, number], core: [number, number]): Tile[][] =>
  Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => {
    if (x === start[0] && y === start[1]) return 'LANDER'
    if (x === core[0] && y === core[1]) return 'CORE'
    if (walls.some(([wx, wy]) => wx === x && wy === y)) return 'WALL'
    if (shadows.some(([sx, sy]) => sx === x && sy === y)) return 'SHADOW'
    return 'SUN'
  }))

const levels: Level[] = [
  { name: 'Shackleton Rim', delay: 1500, flare: 20, start: [1, 7], core: [6, 1], intro: 'A gentle first traverse. Collect the ice core, then guide the rover back to the lander.' , grid: makeMap([[3,3],[4,3],[3,4],[0,4],[7,5]], [[2,5],[5,2]], [1,7], [6,1]) },
  { name: 'Cryo Basin', delay: 2600, flare: 16, start: [0, 7], core: [7, 0], intro: 'The ice sits beyond a permanently shadowed region. Boost the heater before crossing the cold.' , grid: makeMap([[2,2],[3,2],[4,2],[2,3],[0,4],[1,4],[2,4],[6,4],[7,4],[1,5],[6,6]], [[3,4],[4,4],[5,4],[3,5],[4,5],[5,5],[6,4],[2,6]], [0,7], [7,0]) },
  { name: 'Solar Storm Evacuation', delay: 3500, flare: 12, start: [0, 7], core: [7, 0], intro: 'A fast-moving storm is closing in. Shield through the flares, secure the core, and evacuate.' , grid: makeMap([[1,1],[2,1],[4,1],[5,1],[6,1],[1,2],[6,2],[1,3],[3,3],[4,3],[6,3],[2,4],[3,4],[6,4],[1,5],[4,5],[5,5],[6,5]], [[2,2],[5,2],[2,3],[5,4],[3,5],[2,6],[4,6],[5,6]], [0,7], [7,0]) },
]

const commandIcons: Record<Command, typeof ArrowUp> = { NORTH: ArrowUp, SOUTH: ArrowDown, EAST: ArrowRight, WEST: ArrowLeft, 'DRILL CORE': Drill, 'HEATER BOOST': Flame, 'RAD-SHIELD': Shield }
const directions: Record<string, [number, number]> = { NORTH: [0,-1], SOUTH: [0,1], EAST: [1,0], WEST: [-1,0] }

type Game = { level: number; status: Status; pos: [number, number]; lastKnownPos: [number, number]; queue: Command[]; battery: number; radiation: number; hasCore: boolean; heaterTurns: number; shieldTurns: number; flareIn: number; progress: number; steps: number; logs: string[]; flash: boolean; failure: string }
const initialGame = (level: number): Game => ({ level, status: 'BRIEFING', pos: [...levels[level].start], lastKnownPos: [...levels[level].start], queue: [], battery: 100, radiation: 0, hasCore: false, heaterTurns: 0, shieldTurns: 0, flareIn: levels[level].flare, progress: 0, steps: 0, logs: ['MISSION CONTROL ONLINE — LRO terrain map loaded.', 'Radio signal travels at 299,792 km/s. Queue commands before transmitting.'], flash: false, failure: '' })

export default function Page() {
  const [game, setGame] = useState<Game>(() => initialGame(0))
  const live = useRef(game)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)
  const gameRef = useCallback((next: Game | ((g: Game) => Game)) => { const value = typeof next === 'function' ? next(live.current) : next; live.current = value; setGame(value) }, [])
  const update = useCallback((patch: Partial<Game>, line?: string) => gameRef(g => ({ ...g, ...patch, logs: line ? [line, ...g.logs].slice(0, 8) : g.logs })), [gameRef])
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; if (interval.current) clearInterval(interval.current) }
  const finish = (status: 'WON' | 'LOST', message = '') => {
    const g = live.current
    clearTimers()
    gameRef({ ...g, status, failure: message, logs: [status === 'WON' ? 'EXTRACTION CONFIRMED — mission accomplished.' : message, ...g.logs].slice(0, 8) })
  }
  const startLevel = (idx: number) => { clearTimers(); gameRef(initialGame(idx)) }
  const startMission = () => update({ status: 'IDLE' }, `MISSION ${game.level + 1} ACTIVE — ${levels[game.level].name.toUpperCase()}.`)
  const enqueue = (command: Command) => {
    const g = live.current
    if (g.status !== 'IDLE' || g.queue.length >= 5) return
    update({ queue: [...g.queue, command] }, `COMMAND QUEUED: ${command}.`)
  }
  const transmit = () => {
    const g = live.current
    if (g.status !== 'IDLE' || !g.queue.length) return
    const commands = [...g.queue]
    gameRef({ ...g, status: 'TRANSMITTING', lastKnownPos: [...g.pos], progress: 0, queue: [], logs: ['UPLINK TRANSMITTED — awaiting lunar relay.', ...g.logs].slice(0,8) })
    const started = Date.now()
    interval.current = setInterval(() => {
      const current = live.current
      const progress = Math.min(100, ((Date.now() - started) / levels[current.level].delay) * 100)
      gameRef({ ...current, progress })
      if (progress >= 100) {
        if (interval.current) clearInterval(interval.current)
        gameRef(prev => ({ ...prev, status: 'EXECUTING', progress: 100, logs: ['SIGNAL RECEIVED — astronaut executing command sequence.', ...prev.logs].slice(0,8) }))
        commands.forEach((command, index) => {
          const timer = setTimeout(() => {
            const c = live.current
            if (c.status !== 'EXECUTING') return
            let next: Game = { ...c, steps: c.steps + 1 }
            if (directions[command]) {
              const [dx,dy] = directions[command]
              const x = c.pos[0] + dx, y = c.pos[1] + dy
              if (x < 0 || x > 7 || y < 0 || y > 7) next.logs = [`${command}: crater map boundary. Position unchanged.`, ...c.logs].slice(0,8)
              else if (levels[c.level].grid[y][x] === 'WALL') next.logs = ['LRO WARNING: steep rim (>20°) blocks route. Replot command.', ...c.logs].slice(0,8)
              else {
                const tile = levels[c.level].grid[y][x]
                next.pos = [x,y]
                if (tile === 'SUN') next.battery = Math.min(100, c.battery + 5)
                if (tile === 'SHADOW' && c.heaterTurns <= 0) next.battery = c.battery - 30
                next.heaterTurns = Math.max(0, c.heaterTurns - 1)
                next.shieldTurns = Math.max(0, c.shieldTurns - 1)
                next.logs = [tile === 'SHADOW' ? (c.heaterTurns > 0 ? 'HEATER ACTIVE — safe crossing through −180°C shadow.' : 'CRYOGENIC SHADOW — battery drained by 30%.') : 'Traverse complete — sunlit regolith recharged +5% battery.', ...c.logs].slice(0,8)
              }
            } else if (command === 'DRILL CORE') {
              if (c.pos[0] === levels[c.level].core[0] && c.pos[1] === levels[c.level].core[1]) { next.hasCore = true; next.logs = ['ICE CORE SECURED — sample can now be returned to the lander.', ...c.logs].slice(0,8) }
              else next.logs = ['DRILL: no ice core at this location. Move to the marked deposit.', ...c.logs].slice(0,8)
            } else if (command === 'HEATER BOOST') { next.heaterTurns = 2; next.logs = ['HEATER BOOST — shadow immunity for the next 2 moves.', ...c.logs].slice(0,8) }
            else { next.shieldTurns = 2; next.logs = ['RAD-SHIELD ARMED — blocks the next solar flare.', ...c.logs].slice(0,8) }
            const tile = levels[c.level].grid[next.pos[1]][next.pos[0]]
            if (tile === 'LANDER' && next.hasCore) { gameRef(next); finish('WON'); return }
            if (next.battery <= 0) { gameRef(next); finish('LOST', 'Suit battery froze in cryogenic shadow!'); return }
            if (next.radiation >= 100) { gameRef(next); finish('LOST', 'Radiation limit exceeded during solar storm!'); return }
            if (index === commands.length - 1) next.status = 'IDLE'
            gameRef(next)
          }, 450 * (index + 1))
          timers.current.push(timer)
        })
      }
    }, 40)
  }

  useEffect(() => {
    if (!['IDLE','TRANSMITTING','EXECUTING'].includes(game.status)) return
    const tick = setInterval(() => {
      const g = live.current
      if (!['IDLE','TRANSMITTING','EXECUTING'].includes(g.status)) return
      const flareIn = g.flareIn - 1
      if (flareIn <= 0) {
        const blocked = g.shieldTurns > 0
        const radiation = g.radiation + (blocked ? 0 : 45)
        const next = { ...g, flareIn: levels[g.level].flare, radiation, shieldTurns: blocked ? Math.max(0, g.shieldTurns - 1) : g.shieldTurns, flash: true, logs: [blocked ? 'RAD-SHIELD BLOCKED SOLAR FLARE! NASA DONKI space weather alert received.' : 'SOLAR FLARE +45 mSv — NASA DONKI detected a coronal mass ejection.', ...g.logs].slice(0,8) }
        gameRef(next)
        const flashTimer = setTimeout(() => update({ flash: false }), 2000)
        timers.current.push(flashTimer)
        if (radiation >= 100) finish('LOST', 'Radiation limit exceeded during solar storm!')
      } else gameRef({ ...g, flareIn })
    }, 1000)
    return () => clearInterval(tick)
  }, [game.status, game.level, gameRef, update])

  const level = levels[game.level]
  const busy = game.status === 'TRANSMITTING' || game.status === 'EXECUTING'
  const addCommand = (command: Command) => enqueue(command)

  return <main className="min-h-screen bg-[#060b14] px-3 py-4 font-mono text-slate-200 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-cyan-950 pb-4">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan-500/40 bg-cyan-400/10 text-cyan-300"><Rocket size={22}/></div><div><div className="text-[10px] tracking-[.3em] text-cyan-500">NASA // ARTEMIS PROGRAM</div><h1 className="text-lg font-bold tracking-wide text-white sm:text-xl">LUNAR COMM-LINK <span className="text-cyan-400">/</span> <span className="text-slate-400">MISSION CONTROL</span></h1></div></div>
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-[#0a1220] p-1">{levels.map((item,i)=><button key={item.name} onClick={()=>startLevel(i)} aria-label={`Select level ${i+1}`} className={`rounded px-3 py-2 text-[10px] font-bold tracking-wider transition ${game.level===i?'bg-cyan-400/15 text-cyan-300':'text-slate-500 hover:text-white'}`}>LVL {i+1}</button>)}</div>
      </header>
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="SUIT BATTERY" value={`${Math.max(0,game.battery)}%`} percent={game.battery} color="emerald" icon={<Activity size={15}/>}/>
        <Metric label="RADIATION DOSE" value={`${game.radiation} mSv`} percent={game.radiation} color="amber" icon={<Zap size={15}/>}/>
        <div className="rounded-xl border border-cyan-950 bg-[#0d1526] p-3"><div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-slate-500"><span>ICE CORE</span><Gem size={15} className={game.hasCore?'text-cyan-300':'text-slate-700'}/></div><div className={`text-xs font-bold tracking-widest ${game.hasCore?'text-emerald-400':'text-slate-400'}`}>{game.hasCore?'SECURED':'UNCOLLECTED'}</div></div>
        <div className="rounded-xl border border-cyan-950 bg-[#0d1526] p-3"><div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-slate-500"><span>EARTH → MOON UPLINK</span><Radio size={15} className={busy?'animate-pulse text-cyan-300':'text-slate-600'}/></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-400 transition-[width] duration-100" style={{width:`${game.progress}%`}}/></div><div className="mt-1 text-right text-[9px] text-cyan-500">{game.status==='TRANSMITTING'?`${Math.floor(game.progress)}% IN TRANSIT`:game.status==='EXECUTING'?'COMMANDS EXECUTING':`${(level.delay/1000).toFixed(1)}s SIGNAL DELAY`}</div></div>
      </section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-950 bg-[#0d1526] px-4 py-3"><div><div className="text-[10px] tracking-[.25em] text-cyan-500">CURRENT OPERATION</div><div className="mt-1 text-sm font-bold text-white">{level.name} <span className="ml-2 text-[10px] font-normal text-slate-500">// {level.delay/1000}s LIGHT-SPEED DELAY</span></div></div><p className="max-w-xl text-xs leading-relaxed text-slate-400">{level.intro}</p></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(500px,1.15fr)_minmax(420px,.85fr)]">
        <section className="rounded-xl border border-cyan-950 bg-[#0d1526] p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-xs font-bold tracking-[.2em] text-white">SHACKLETON CRATER SURFACE MAP</h2><p className="mt-1 text-[9px] tracking-widest text-slate-600">LRO ELEVATION DATA // GRID 08 × 08</p></div><div className="flex items-center gap-2 text-[9px] text-emerald-400"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> LIVE TELEMETRY</div></div>
          <div className="mx-auto grid w-full max-w-[600px] grid-cols-8 gap-1 rounded-lg border border-slate-800 bg-[#080f1b] p-2 sm:gap-1.5 sm:p-3" role="grid" aria-label="8 by 8 lunar terrain map">{level.grid.map((row,y)=>row.map((tile,x)=>{const here=game.pos[0]===x&&game.pos[1]===y;const known=game.status==='TRANSMITTING'&&game.lastKnownPos[0]===x&&game.lastKnownPos[1]===y;const Icon=tile==='SUN'?Sun:tile==='SHADOW'?Snowflake:tile==='WALL'?Mountain:tile==='CORE'?Gem:Rocket;return <div role="gridcell" aria-label={`${tile.toLowerCase()} at row ${y+1}, column ${x+1}${here?' astronaut location':''}`} key={`${x}-${y}`} className={`relative aspect-square min-w-0 rounded-md border flex items-center justify-center transition-all ${tile==='SUN'?'border-emerald-900/50 bg-emerald-950/30 text-emerald-500/60':tile==='SHADOW'?'border-indigo-800/70 bg-indigo-950/80 text-indigo-300':tile==='WALL'?'border-slate-700 bg-slate-800/80 text-slate-500':tile==='CORE'?'border-cyan-500/50 bg-cyan-950/60 text-cyan-300':'border-amber-700/50 bg-amber-950/30 text-amber-400'} ${here?'ring-2 ring-cyan-300 ring-offset-1 ring-offset-[#080f1b] z-10':''} ${known?'outline outline-2 outline-dashed outline-cyan-300/70':''}`}>
            <Icon className="h-[38%] w-[38%]" strokeWidth={1.8}/>{here&&<span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-cyan-300 text-[#06111d]"><UserRound size={11}/></span>}{tile==='CORE'&&game.hasCore&&<span className="absolute inset-0 grid place-items-center rounded bg-[#0d1526]/80"><Check size={15} className="text-emerald-400"/></span>}
          </div>}))}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[9px] text-slate-500">{[['Sunlit regolith',Sun],['Shadow −180°C',Snowflake],['Crater wall',Mountain],['Ice core',Gem],['Lander',Rocket],['Astronaut',UserRound]].map(([label,Icon])=>{const I=Icon as typeof Sun;return <span key={label as string} className="flex items-center gap-1.5"><I size={12}/>{label as string}</span>})}</div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-800 bg-[#080f1b] px-3 py-2 text-[10px]"><span className="text-slate-500">ASTRONAUT COORDINATES</span><span className="text-cyan-300">X {game.pos[0]+1} <span className="text-slate-600">/</span> Y {game.pos[1]+1}</span><span className="text-slate-500">{game.heaterTurns>0?`HEATER ${game.heaterTurns} MOVES`:''} {game.shieldTurns>0?`SHIELD ${game.shieldTurns} FLARE`:''}</span></div>
        </section>
        <div className="space-y-4">
          <section className="rounded-xl border border-cyan-950 bg-[#0d1526] p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-xs font-bold tracking-[.2em] text-white">COMMAND DECK</h2><p className="mt-1 text-[9px] tracking-widest text-slate-600">SEQUENCE BUFFER // MAX 05</p></div><div className="flex gap-1.5">{Array.from({length:5},(_,i)=><div key={i} className={`grid h-7 w-7 place-items-center rounded border text-[10px] ${game.queue[i]?'border-cyan-700 bg-cyan-950 text-cyan-300':'border-slate-800 bg-[#080f1b] text-slate-700'}`}>{game.queue[i]?<span title={game.queue[i]}>{i+1}</span>:i+1}</div>)}</div></div>
            <div className="mb-3 flex min-h-9 flex-wrap gap-1.5">{game.queue.length?game.queue.map((c,i)=>{const I=commandIcons[c];return <span key={`${c}-${i}`} className="flex items-center gap-1 rounded border border-cyan-900 bg-cyan-950/50 px-2 py-1 text-[9px] text-cyan-300"><I size={11}/>{c}</span>}):<span className="self-center text-[10px] text-slate-600">No commands queued. Choose an action below.</span>}</div>
            <div className="mb-3 grid grid-cols-2 gap-2">{(['NORTH','SOUTH','EAST','WEST','DRILL CORE','HEATER BOOST','RAD-SHIELD'] as Command[]).map(c=>{const I=commandIcons[c];return <button key={c} onClick={()=>addCommand(c)} disabled={busy||game.status!=='IDLE'||game.queue.length>=5} className="flex items-center justify-center gap-2 rounded-lg border border-slate-800 bg-[#0a1220] px-2 py-2.5 text-[10px] font-bold tracking-wider text-slate-300 transition hover:border-cyan-600 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"><I size={14}/>{c}</button>})}</div>
            <div className="flex gap-2"><button onClick={()=>update({queue:game.queue.slice(0,-1)},'LAST COMMAND REMOVED.')} disabled={busy||game.status!=='IDLE'||!game.queue.length} className="rounded-lg border border-slate-700 px-3 text-[9px] font-bold tracking-widest text-slate-400 hover:text-white disabled:opacity-30">REMOVE LAST</button><button onClick={()=>update({queue:[]},'COMMAND QUEUE CLEARED.')} disabled={busy||game.status!=='IDLE'||!game.queue.length} className="rounded-lg border border-slate-700 px-3 text-[9px] font-bold tracking-widest text-slate-400 hover:text-white disabled:opacity-30">CLEAR</button><button onClick={transmit} disabled={busy||game.status!=='IDLE'||!game.queue.length} className="ml-auto flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-3 text-[10px] font-black tracking-[.15em] text-[#06111d] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"><Radio size={15}/>{game.status==='TRANSMITTING'?'UPLINK IN TRANSIT':game.status==='EXECUTING'?'EXECUTING SEQUENCE':'TRANSMIT UPLINK'}<ChevronRight size={14}/></button></div>
          </section>
          <section className={`rounded-xl border p-4 ${game.flareIn<=5?'border-orange-700/60 bg-orange-950/20':'border-cyan-950 bg-[#0d1526]'}`}><div className="flex items-center gap-3"><div className={`grid h-10 w-10 place-items-center rounded-lg ${game.flareIn<=5?'bg-orange-500/15 text-orange-400':'bg-amber-500/10 text-amber-400'}`}><Sun size={20}/></div><div className="flex-1"><div className="flex justify-between text-[10px] tracking-widest text-slate-500"><span>SPACE WEATHER // SOLAR FLARE</span><span className="text-amber-400">{game.flareIn}s</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-amber-500 transition-all" style={{width:`${game.flareIn/level.flare*100}%`}}/></div></div><div className="text-right text-[9px] text-slate-600">{game.shieldTurns>0?<span className="text-cyan-300">SHIELD READY</span>:'+45 mSv'}</div></div></section>
          <section className="overflow-hidden rounded-xl border border-cyan-950 bg-[#0d1526]"><div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3"><Activity size={14} className="text-cyan-400"/><div><h2 className="text-[10px] font-bold tracking-[.18em] text-white">NASA TELEMETRY & STEM LOG</h2></div><span className="ml-auto text-[8px] text-emerald-500">● LIVE</span></div><div className="max-h-[210px] space-y-2 overflow-y-auto p-3">{game.logs.map((line,i)=><div key={`${line}-${i}`} className={`flex gap-2 text-[10px] leading-relaxed ${i===0?'text-cyan-200':'text-slate-500'}`}><span className="shrink-0 text-slate-700">[{String(game.logs.length-i).padStart(2,'0')}]</span><span>{line}</span></div>)}<div className="border-t border-slate-800 pt-2 text-[9px] leading-relaxed text-slate-600">STEM NOTE: Light takes about 1.3 seconds to travel from Earth to the Moon. NASA&apos;s Lunar Reconnaissance Orbiter maps crater slopes; steep rims can block a rover. Flares are monitored by NASA&apos;s DONKI space-weather database.</div></div></section>
        </div>
      </div>
      <footer className="mt-4 flex flex-wrap justify-between gap-2 border-t border-slate-900 pt-3 text-[9px] tracking-widest text-slate-700"><span>ARTEMIS SURFACE OPERATIONS // SIMULATION</span><span>MISSION TIME {game.steps} COMMANDS EXECUTED</span></footer>
    </div>
    {game.flash&&<div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40 animate-pulse bg-red-500/25"/>}
    {game.status==='BRIEFING'&&<Overlay title="LUNAR COMM-LINK" eyebrow="ARTEMIS MISSION BRIEFING" icon={<Rocket size={26}/>}><p>{level.intro}</p><p className="mt-3 text-slate-400">Plan a sequence of up to five commands, then transmit. The astronaut receives your instructions only after the radio signal crosses the distance to the Moon.</p><button onClick={startMission} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 py-3 text-xs font-black tracking-[.18em] text-[#06111d] hover:bg-cyan-300">START MISSION <ChevronRight size={16}/></button><p className="mt-3 text-center text-[9px] tracking-widest text-slate-600">LEVEL {game.level+1} / 3 · {level.delay/1000}s UPLINK DELAY</p></Overlay>}
    {game.status==='WON'&&<Overlay title="MISSION ACCOMPLISHED" eyebrow="EXTRACTION CONFIRMED" icon={<Check size={26}/>}><p>Ice core secured and astronaut safely returned to the lander.</p><div className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/30 p-3 text-xs text-emerald-300">{game.steps} commands executed · {game.battery}% battery · {game.radiation} mSv radiation</div><p className="mt-3 text-xs text-slate-400">You coordinated across a quarter-million miles. Radio communication has a real light-speed delay, so mission control plans command sequences in advance.</p><button onClick={()=>game.level<2?startLevel(game.level+1):startLevel(game.level)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 py-3 text-xs font-black tracking-[.18em] text-[#06111d] hover:bg-emerald-300">{game.level<2?'NEXT LEVEL':'PLAY AGAIN'} <ChevronRight size={16}/></button></Overlay>}
    {game.status==='LOST'&&<Overlay title="MISSION FAILED" eyebrow="FLIGHT DIRECTOR ALERT" icon={<AlertTriangle size={26}/>}><p className="text-orange-200">{game.failure}</p><p className="mt-3 text-xs text-slate-400">Mission control has reset the simulation. Review your route and use the heater or radiation shield when needed.</p><button onClick={()=>startLevel(game.level)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-3 text-xs font-black tracking-[.18em] text-[#06111d] hover:bg-orange-400">RETRY LEVEL <ChevronRight size={16}/></button></Overlay>}
  </main>
}

function Metric({label,value,percent,color,icon}:{label:string;value:string;percent:number;color:'emerald'|'amber';icon:React.ReactNode}) { const amber=color==='amber'; return <div className="rounded-xl border border-cyan-950 bg-[#0d1526] p-3"><div className="mb-2 flex items-center justify-between text-[10px] tracking-widest text-slate-500"><span>{label}</span><span className={amber?'text-amber-400':'text-emerald-400'}>{icon}</span></div><div className="mb-2 text-sm font-bold text-white">{value}</div><div className="h-1.5 overflow-hidden rounded-full bg-slate-800"><div className={`h-full transition-all ${amber?'bg-amber-500':'bg-emerald-400'}`} style={{width:`${Math.max(0,Math.min(100,percent))}%`}}/></div></div> }
function Overlay({title,eyebrow,icon,children}:{title:string;eyebrow:string;icon:React.ReactNode;children:React.ReactNode}) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#030710]/85 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="mission-dialog-title" className="w-full max-w-md rounded-2xl border border-cyan-700/50 bg-[#0d1526] p-6 shadow-[0_0_80px_rgba(0,240,255,.12)]"><div className="mb-5 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-700/50 bg-cyan-400/10 text-cyan-300">{icon}</div><div><div className="text-[9px] tracking-[.25em] text-cyan-500">{eyebrow}</div><h2 id="mission-dialog-title" className="mt-1 text-lg font-black tracking-wide text-white">{title}</h2></div></div><div className="text-sm leading-relaxed text-slate-300">{children}</div></section></div> }
