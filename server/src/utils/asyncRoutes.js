// Express 4 does not catch errors from `async` route handlers: a rejected promise becomes an
// unhandled rejection, which crashes the Node process. This patches Express's Route methods once so
// every handler's rejected promise is passed to next(err) and reaches the app's error handler (500).
// (Express 5 does this natively; remove this file when upgrading.)
const path = require('path');
const Route = require('express/lib/router/route');
// Express's own list of HTTP methods (resolved from Express, not hoisting luck)
const methods = require(require.resolve('methods', { paths: [path.dirname(require.resolve('express'))] }));

let installed = false;

function wrap(fn) {
  if (typeof fn !== 'function' || fn.length === 4) return fn; // leave error handlers alone
  const wrapped = function (req, res, next) {
    const result = fn.call(this, req, res, next);
    if (result && typeof result.then === 'function') result.then(undefined, next);
    return result;
  };
  Object.defineProperty(wrapped, 'length', { value: fn.length });
  return wrapped;
}

function installAsyncErrorHandling() {
  if (installed) return;
  installed = true;
  for (const method of [...methods, 'all']) {
    const original = Route.prototype[method];
    if (typeof original !== 'function') continue;
    Route.prototype[method] = function (...handlers) {
      return original.apply(this, handlers.flat(Infinity).map(wrap));
    };
  }
}

module.exports = { installAsyncErrorHandling };
