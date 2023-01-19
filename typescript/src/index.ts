import 'dotenv/config'
import fetch from 'node-fetch'
import open from 'open'
import WebSocket from 'ws'
import { GameInstance, Message, NoPlaneState } from './types'
import { normalizeHeading } from './utils/math'
import { message } from './utils/message'

const frontend_base = 'noflight.monad.fi'
const backend_base = 'noflight.monad.fi/backend'

let plane1Turns = [45, 45]
let plane2Turns = [45, 45]
let plane3Turns = [270, 90]
const maxTurnPerTick = 20

const generateCommands = (gameState: NoPlaneState) => {
  const { aircrafts, airports } = gameState
  const commands = []

  for (const { id, direction, position: planePosition, destination } of aircrafts) {
    if (id === '3')
      if (plane3Turns[0] !== 0) {
        const turn = plane3Turns[0] > maxTurnPerTick ? maxTurnPerTick : plane3Turns[0]
        commands.push(`HEAD ${id} ${normalizeHeading(direction + turn)}`)
        plane3Turns[0] = plane3Turns[0] - turn
      } else if (plane3Turns[0] === 0 && plane3Turns[1] !== 0 && planePosition.x < airports[0].position.x + 10) {
        const turn = plane3Turns[1] > maxTurnPerTick ? maxTurnPerTick : plane3Turns[1]
        commands.push(`HEAD ${id} ${normalizeHeading(direction + turn)}`)
        plane3Turns[1] = plane3Turns[1] - turn
      } else {
        commands.push(`HEAD ${id} ${normalizeHeading(direction)}`)
      }
    if (id === '1') {
      if (plane1Turns[0] !== 0) {
        const turn = plane1Turns[0] > maxTurnPerTick ? maxTurnPerTick : plane1Turns[0]
        commands.push(`HEAD ${id} ${normalizeHeading(direction + turn)}`)
        plane1Turns[0] = plane1Turns[0] - turn
      } else if (
        plane1Turns[0] === 0 &&
        plane1Turns[1] !== 0 &&
        planePosition.x > airports.filter((a) => a.name === destination)[0].position.x
      ) {
        const turn = plane1Turns[1] > maxTurnPerTick ? maxTurnPerTick : plane1Turns[1]
        commands.push(`HEAD ${id} ${normalizeHeading(direction - turn)}`)
        plane1Turns[1] = plane1Turns[1] - turn
      } else {
        commands.push(`HEAD ${id} ${normalizeHeading(direction)}`)
      }
    }
    if (id === '2') {
      if (plane2Turns[0] !== 0) {
        const turn = plane2Turns[0] > maxTurnPerTick ? maxTurnPerTick : plane2Turns[0]
        commands.push(`HEAD ${id} ${normalizeHeading(direction + turn)}`)
        plane2Turns[0] = plane2Turns[0] - turn
      } else if (
        plane2Turns[0] === 0 &&
        plane2Turns[1] !== 0 &&
        planePosition.x > airports.filter((a) => a.name === destination)[0].position.x
      ) {
        const turn = plane2Turns[1] > maxTurnPerTick ? maxTurnPerTick : plane2Turns[1]
        commands.push(`HEAD ${id} ${normalizeHeading(direction - turn)}`)
        plane2Turns[1] = plane2Turns[1] - turn
      } else {
        commands.push(`HEAD ${id} ${normalizeHeading(direction)}`)
      }
    }
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
