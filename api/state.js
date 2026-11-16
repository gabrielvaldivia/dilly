import { loadState, publicState, sendJson, route } from './_state.js';

export default route({
  async GET(req, res) {
    const state = await loadState();
    return sendJson(res, 200, publicState(state));
  },
});
