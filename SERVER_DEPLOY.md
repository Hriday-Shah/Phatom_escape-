# Deploying Phantom Escape Server

Quick guide to deploy the Colyseus multiplayer server.

## Option 1: Render.com (Recommended)

### Setup
1. Go to [render.com](https://render.com) and sign in
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `phantom-escape-server`
   - **Root Directory**: `server`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free (or paid for better performance)

### Environment Variables
- `NODE_ENV`: `production`
- `PORT`: (Auto-set by Render)

### After Deploy
Your server URL will be: `https://phantom-escape-server-XXXX.onrender.com`

Update your client to use this URL:
```
https://phatom-escape.onrender.com/?server=wss://phantom-escape-server-XXXX.onrender.com
```

**Note**: Free tier spins down after 15 minutes of inactivity. First connection will be slow.

## Option 2: Railway.app

### Setup
1. Go to [railway.app](https://railway.app) and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js

### Configuration
Add `railway.json` to `/server`:
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

### Environment Variables
- `NODE_ENV`: `production`

### After Deploy
Your server URL will be: `https://phantom-escape-server-production.up.railway.app`

## Option 3: Heroku

### Setup
1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create phantom-escape-server`
4. Deploy:
```bash
cd server
git init
heroku git:remote -a phantom-escape-server
git add .
git commit -m "Initial commit"
git push heroku main
```

### Procfile
Create `server/Procfile`:
```
web: npm start
```

### After Deploy
Your server URL: `https://phantom-escape-server.herokuapp.com`

## Testing Your Server

After deployment, test the health endpoint:
```bash
curl https://your-server-url.com/health
```

Should return:
```json
{
  "ok": true,
  "rooms": 0,
  "players": 0,
  "uptime": 123
}
```

## Monitoring

### Colyseus Monitor
In development, visit: `http://localhost:2567/colyseus`

This shows:
- Active rooms
- Player counts
- Room states
- Connection history

**Important**: This is disabled in production (`NODE_ENV=production`)

### Health Check
Set up monitoring on `/health` endpoint:
- Render: Auto-configured
- Railway: Add health check in settings
- Heroku: Use UptimeRobot or similar

## Scaling Considerations

### Free Tier Limits
- **Render**: Spins down after 15 min inactivity
- **Railway**: 500 hours/month free
- **Heroku**: Spins down after 30 min inactivity

### Performance Tips
1. **Use paid tier** for always-on servers (better UX)
2. **Enable WebSocket keep-alive** (already implemented in HouseRoom)
3. **Monitor memory** (Colyseus rooms stay in memory)
4. **Set auto-dispose** on empty rooms (already enabled)
5. **Rate limiting** (already implemented)

### Cost Estimates
- **Render**: $7/month for Starter (always-on)
- **Railway**: $5/month for Starter
- **Heroku**: $7/month for Basic (always-on)

## Connecting Clients

### Local Development
```
http://localhost:5173/?server=ws://localhost:2567
```

### Production
```
https://your-game-url.com/?server=wss://your-server-url.com
```

### Setting Default Server
Set `VITE_SERVER_URL` in client deployment:
```bash
# .env.production
VITE_SERVER_URL=wss://your-server-url.com
```

Then clients connect automatically without `?server=` parameter.

## Troubleshooting

### "Cannot reach server"
- Check server is running: `curl https://your-server/health`
- Verify CORS is enabled (already configured)
- Use `wss://` (not `ws://`) for HTTPS clients

### "Connection refused"
- Check firewall settings
- Verify WebSocket upgrade is allowed
- Check server logs for errors

### "Room not found"
- Rooms expire when empty (by design)
- Room codes are case-sensitive
- Codes are 6 characters (A-Z, 0-9)

### High Memory Usage
- Each room stays in memory
- Empty rooms auto-dispose after players leave
- Monitor with `ps aux | grep node`

## Next Steps

1. Deploy server to your chosen platform
2. Test health endpoint
3. Connect client with `?server=wss://...`
4. Test with multiple devices
5. Monitor performance and adjust as needed

## Support

- Colyseus Docs: https://docs.colyseus.io
- Server Code: `/server/src/HouseRoom.ts`
- Protocol: See `MULTIPLAYER.md`
