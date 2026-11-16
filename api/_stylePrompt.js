// The art direction sent with every fighter photo to the image model.
export const STYLE_PROMPT = `Transform the person in the provided photograph into a hand-illustrated character portrait inspired by late-1990s and early-2000s arcade fighting games, particularly Marvel vs. Capcom 2.

IDENTITY
Preserve the subject's recognizable facial features, proportions, skin tone, hairstyle, facial hair, age, and distinctive characteristics. The result must clearly look like the same person. Keep their original clothing, accessories, and colors, but reinterpret them as illustrated artwork.

ART DIRECTION
- Authentic late-1990s Capcom arcade character illustration aesthetic.
- Bold, expressive black ink outlines with varied line thickness.
- Angular, high-contrast cel shading with sharply defined shadow shapes.
- Saturated colors, warm skin highlights, deep purple and blue shadows.
- Subtle printed comic-book texture, fine ink hatching, and halftone grain.
- Exaggerated dimensionality and dramatic directional lighting.
- Confident, hand-drawn linework with slightly rough edges.
- Detailed facial rendering, with simplified graphic shapes for clothing.
- A polished 2D illustration, not a 3D render, photograph, or generic anime portrait.

COMPOSITION
- Square 1:1 character-select portrait.
- Head and upper torso visible, filling most of the frame.
- Dynamic three-quarter angle, with the face turned toward the viewer.
- Confident, serious fighting-game character expression.
- Slightly low camera angle for a heroic presence.
- Dramatic diagonal background streaks in electric blue, indigo, and violet.
- Strong silhouette and clear separation between character and background.

CONSISTENCY
Apply the same illustration style, linework, lighting, background treatment, and framing regardless of the input photo. Preserve each person's individual identity and outfit. Do not invent costumes, weapons, armor, or superpowers.

AVOID
Photorealism, smooth digital airbrushing, 3D rendering, plastic skin, soft watercolor effects, chibi proportions, overly cute anime styling, excessive facial distortion, text, logos, borders, and UI elements.

OUTPUT
One finished, high-quality, square arcade character portrait with no text or watermark.`;

// Turns a fighter's arcade portrait into their beaten-up "defeated"
// portrait for the win screen. Generated once per portrait.
export const BEATEN_PROMPT = `Redraw this arcade fighting-game character portrait as the character's "defeated" portrait, the kind shown on a classic 1990s arcade fighting game's results screen after they lose.

KEEP EXACTLY
- The same person: face, identity, skin tone, hair, facial hair, and age.
- The same illustration style: bold black ink outlines, angular cel shading, halftone texture, saturated colors.
- The same clothing, framing, camera angle, and diagonal streak background.

SHOW THEM BEATEN UP, CARTOON STYLE
- A swollen black eye and a few bruises and scrapes on the face.
- One or two adhesive bandages on the face or forehead.
- Messy, disheveled hair and sweat drops.
- A dazed, exhausted, slightly embarrassed expression.
- Slightly rumpled or torn clothing.

KEEP IT FUN
Comedic and cartoonish, like a video game knockout. No blood, no gore, no open wounds, nothing graphic.

OUTPUT
One square portrait in the same style, with no text, logos, borders, or UI.`;
