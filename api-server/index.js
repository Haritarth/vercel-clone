const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')

const app = express()
const PORT = 9000

const subscriber = new Redis('rediss://default:AVjbAAIjcDFhNTllMDk4YmFmMTg0M2U0ODNkODE5YmZmY2NhNjZjM3AxMA@glorious-lemming-22747.upstash.io:6379')

const io = new Server({ cors: '*' })

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})

io.listen(9002, () => console.log('Socket Server 9002'))

const ecsClient = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIA4MTWL4BOQEZ7NVGQ',
        secretAccessKey: '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'
    }
})

const config = {
    CLUSTER: 'arn:aws:ecs:ap-south-1:851725508701:cluster/builder-cluster',
    TASK: 'arn:aws:ecs:ap-south-1:851725508701:task-definition/builder-task'
}

app.use(express.json())

app.post('/project', async (req, res) => {
    const { gitURL, slug } = req.body
    const projectSlug = slug ? slug : generateSlug()

    // Spin the container
    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: ['subnet-0b608b29540fb4ac1', 'subnet-023b0dd3fb6fd708b', 'subnet-01fe4ebb20122f464'],
                securityGroups: ['sg-02d32e0b366e1dbb0']
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'builder-image',
                    environment: [
                        { name: 'GIT_REPOSITORY__URL', value: gitURL },
                        { name: 'PROJECT_ID', value: projectSlug }
                    ]
                }
            ]
        }
    })

    await ecsClient.send(command);

    return res.json({ status: 'queued', data: { projectSlug, url: `http://${projectSlug}.localhost:8000` } })

})

async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}


initRedisSubscribe()

app.listen(PORT, () => console.log(`API Server Running..${PORT}`))