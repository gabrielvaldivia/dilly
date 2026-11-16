/* ------------------------------------------------------------------ */
/* What the loser mumbles on the win screen, picked by how the game     */
/* went (the celebration variant id). {w} = winner, {l} = loser.        */
/* ------------------------------------------------------------------ */

const LINES = {
  "first-ever": ["First game doesn't count. Everyone knows that.", "That was a practice round. Nobody told you?"],
  shutout: ["Zero is technically a number.", "I was saving my points for later.", "Can we just… not write this one down?"],
  "one-point": ["I scored a point. Put it on the highlight reel.", "One point is more than zero. Math says so."],
  mercy: ["Two points. Twice as many as I planned.", "I've been hit by softer trucks."],
  "streak-breaker": ["All empires fall. Mine fell on its face.", "I let you win so you'd stop crying."],
  dynasty: ["At this point I'm just your sparring partner.", "Is there a mercy rule? Asking for me."],
  unstoppable: ["Five in a row? I'm building suspense.", "New paddle. Same result. I need a new me."],
  "on-fire": ["You're on fire. I'm on the floor.", "Somebody check {w} for batteries."],
  "heating-up": ["Three's a pattern. Mine is losing.", "I'm still warming up. Still."],
  milestone: ["Happy milestone. My dignity was the gift.", "I'd clap, but my arms hurt."],
  "first-win": ["Enjoy it. It won't happen again.", "Beginner's luck. Very, very lucky beginner."],
  revenge: ["Fine. We're even. Delete the replay.", "I was being nice last time. And this time."],
  "back-to-back": ["Lightning struck twice. On my face.", "Same time next week. I need revenge."],
  marathon: ["I was winning in my heart the whole time.", "My legs have filed a formal complaint."],
  "epic-deuce": ["That was a tie with extra steps.", "I demand a recount. And a nap."],
  "deuce-thriller": ["Overtime is a scam.", "One more point and you'd be the one on the floor."],
  overtime: ["I was keeping it entertaining.", "Extra points, extra suffering."],
  grind: ["I lost slowly. That's a strategy.", "Hard work beats talent. Not today, though."],
  sprint: ["Wait — it already started?", "I blinked. I swear I blinked."],
  demolition: ["Did anyone get the license plate?", "I'll be fine. Probably. Call my mom."],
  beating: ["The sun was in my eyes. We play indoors.", "My paddle and I are seeing other people."],
  statement: ["Statement received. Please stop sending it.", "I hadn't even stretched."],
  decisive: ["I had a cramp. In my pride.", "I was playing with my weak hand. Both of them."],
  controlled: ["You got lucky. Repeatedly. On purpose.", "I wasn't trying. That's my story."],
  "hard-fought": ["I was this close. Write that down.", "Close counts in horseshoes. Let's play horseshoes."],
  "nail-biter": ["Basically a tie. I'm counting it as a tie.", "One more point and I'd be the one gloating."],
};

const FALLBACK = ["Rematch. Right now. Before my body notices.", "I demand a rematch."];

export function pickExcuse(variantId, winnerName, loserName) {
  const pool = LINES[variantId] ?? FALLBACK;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return line.replaceAll("{w}", winnerName).replaceAll("{l}", loserName);
}
