const { PORT = 3000 } = process.env

const { uuid } = require('uuidv4')
const express = require('express')

const app = express()
const server = require('http').createServer(app)
const io = require('socket.io')(server)

app.use(require('helmet')())
app.use(require('body-parser').json())
app.use(require('cors')())

app.use(express.static('www'))

const guests = {}

app.post('/auth', (req, res) => {
  if (!req.body.username)
    return res.json({ success: false, reason: 'undefined' })
  
  let username = `${req.body.username}`.trim()

  if (username.length < 4)
    return res.json({ success: false, reason: 'minlength' })

  if (username.length > 64)
    return res.json({ success: false, reason: 'maxlength' })

  if (!/[a-z0-9][a-z0-9_-]*[a-z0-9]/i.test(username))
    return res.json({ success: false, reason: 'format' })

  if (Object.values(io.sockets.sockets).find(socket => socket.metadata && socket.metadata.username === username))
    return res.json({ success: false, reason: 'exists' })

  guests[username] = uuid()
  return res.json({ success: true, token: guests[username] })
})

io.on('connection', socket => {
  socket.once('bind', ({ token }) => {
    const [username] = Object.entries(guests).find(([, value]) => value === token) || []

    if (!username)
      socket.emit('bound', false)
    else {
      delete guests[username]
      socket.metadata = { username, token }
      socket.emit('bound', true)
    }
  })

  socket.on('tx', ({ token, room, ...payload }) => {
    if (!socket.metadata || socket.metadata.token !== token)
      return

    if(room in socket.rooms)
      socket.broadcast.to(room).emit('rx', { room, ...payload })
  })

  socket.on('invite', ({ token, username }) => {
    if (!socket.metadata || socket.metadata.token !== token)
      return

    const peer = Object.values(io.sockets.sockets)
      .find(socket => socket.metadata && socket.metadata.username === username)

    if (!peer)
      socket.emit('invite', false)
    else {
      const room = uuid()
      socket.emit('invite', room)

      socket.emit('summon', { room, name: peer.metadata.username })
      peer.emit('summon', { room, name: socket.metadata.username })
    }
  })

  socket.on('join', ({ token, room }) => {
    if (!socket.metadata || socket.metadata.token !== token)
      return

    socket.join(room)
  })

  socket.on('leave', ({ token, room }) => {
    if (!socket.metadata || socket.metadata.token !== token)
      return

    socket.leave(room)
  })

  socket.on('disconnect', () => {
    console.log('TODO: user disconnected')
  })
})

server.listen(PORT, () => {
  console.log(`running@${PORT}`)
})
