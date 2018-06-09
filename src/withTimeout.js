const delay = require('./delay');

async function withTimeout(ms, rejectReason, promise) {
  const timeoutPromise = delay.reject(ms, rejectReason);
  const result = await Promise.race([promise, timeoutPromise]);
  timeoutPromise.cancel();
  return result;
}

export default withTimeout;
