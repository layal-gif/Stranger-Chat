# Stranger Chat — Updated Version

## Run on the computer
1. Open a terminal in this folder.
2. Run: `npm install`
3. Run: `npm start`
4. Open: `http://localhost:3000`

## Update Android after web changes
Run:
- `npx cap sync android`
- `npx cap open android`

## Added features
- Anonymous country-based matching
- Profile photo and nickname
- Text, image, and voice messages
- Screen sharing with WebRTC
- Report and block controls
- Typing indicator
- Rate limiting and basic profanity filtering
- Responsive light/dark interface
- Basic HTTP security headers

## Important deployment note
Screen sharing and microphone access require HTTPS in production (localhost is allowed during development).
