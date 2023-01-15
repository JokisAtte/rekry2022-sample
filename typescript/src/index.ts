import 'dotenv/config'
import fetch from 'node-fetch'
import open from 'open'
import WebSocket from 'ws'
import { GameInstance, Message, NoPlaneState } from './types'
import { normalizeHeading } from './utils/math'
import { message } from './utils/message'

const frontend_base = 'noflight.monad.fi'
const backend_base = 'noflight.monad.fi/backend'

let firstTurn = 90
let secondTurn = 270

const generateCommands = (gameState: NoPlaneState) => {
  const {id, direction, position: planePosition} = gameState.aircrafts[0]
  const {position : airfieldPosition } = gameState.airports[0]
  const commands = []

  const maxTurnPerTick = 20
  console.log(direction, planePosition)
  if (planePosition.x < airfieldPosition.x - 10 && firstTurn !== 0){
    console.log("alas alas") //Lisää tsekki että mennyt alle alkuperäisen y:n
    const turn = firstTurn > maxTurnPerTick ? maxTurnPerTick : firstTurn
    commands.push(`HEAD ${id} ${normalizeHeading(direction + turn)}`)
    firstTurn = firstTurn - turn
  }
  if (firstTurn === 0 && commands.length === 0){
    console.log("ylös ylös");
     // keksi ehdot millä päästään hienosti seuraavaa käännökseen
    const turn = secondTurn > maxTurnPerTick ? maxTurnPerTick : secondTurn
    commands.push(`HEAD ${id} ${normalizeHeading(direction - turn)}`)
    secondTurn = secondTurn - turn
  }

  return commands
}

const createGame = async (levelId: string, token: string) => {
  const res = await fetch(`https://${backend_base}/api/levels/${levelId}`, {
    method: 'POST',
    headers: {
      Authorization: token,
    },
  })

  if (!res.ok) {
    console.error(`Couldn't create game: ${res.statusText} - ${await res.text()}`)
    return null
  }

  return res.json() as any as GameInstance // Can be made safer
}

const main = async () => {
  const token = process.env['TOKEN'] ?? ''
  const levelId = process.env['LEVEL_ID'] ?? ''

  const game = await createGame(levelId, token)
  if (!game) return

  const url = `https://${frontend_base}/?id=${game.entityId}`
  console.log(`Game at ${url}`)
  await open(url)
  await new Promise((f) => setTimeout(f, 2000))

  const ws = new WebSocket(`wss://${backend_base}/${token}/`)

  ws.addEventListener('open', () => {
    ws.send(message('sub-game', { id: game.entityId }))
  })

  ws.addEventListener('message', ({ data }) => {
    const [action, payload] = JSON.parse(data.toString()) as Message<'game-instance'>

    if (action !== 'game-instance') {
      console.log([action, payload])
      return
    }

    // New game tick arrived!
    const gameState = JSON.parse(payload['gameState']) as NoPlaneState
    const commands = generateCommands(gameState)

    setTimeout(() => {
      ws.send(message('run-command', { gameId: game.entityId, payload: commands }))
    }, 100)
  })
}

await main()
