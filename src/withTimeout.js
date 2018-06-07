const delay = require('./delay');

async function withTimeout(ms, rejectMessage, promise) {
  const timeoutPromise = delay.reject(ms, rejectMessage);
  const result = await Promise.race([promise, timeoutPromise]);
  timeoutPromise.cancel();
  return result;
}

export default withTimeout;
