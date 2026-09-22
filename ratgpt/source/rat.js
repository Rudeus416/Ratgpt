// The answer is deliberately independent of the user's input.
export function generateRatReply() {
  const count = 6 + Math.floor(Math.random() * 85);
  let reply = '';
  let phraseLength = 0;
  for (let i = 0; i < count; i += 1) {
    reply += '吱';
    phraseLength += 1;
    if (i < count - 1 && phraseLength >= 2 && Math.random() < 0.18) {
      reply += '，';
      phraseLength = 0;
    }
  }
  return reply;
}
