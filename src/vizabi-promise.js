/* eslint-disable */

function Promise(resolver) {
  if (!(this instanceof Promise)) {
    return new Promise(resolver);
  }

  this.status = 'pending';
  this.value;
  this.reason;
  this._resolves = [];
  this._rejects = [];

  if (isFn(resolver)) {
    resolver(this.resolve.bind(this), this.reject.bind(this));
  }

  return this;
}

Promise.prototype.then = function (resolve, reject) {
  var next = this._next || (this._next = Promise());
  var status = this.status;
  var x;

  if ('pending' === status) {
    isFn(resolve) && this._resolves.push(resolve);
    isFn(reject) && this._rejects.push(reject);
    return next;
  }

  if ('resolved' === status) {
    if (!isFn(resolve)) {
      next.resolve(resolve);
    } else {
      try {
        x = resolve(this.value);
        resolveX(next, x);
      } catch (e) {
        this.reject(e);
      }
    }
    return next;
  }
  if ('rejected' === status) {
    if (!isFn(reject)) {
      next.reject(reject);
    } else {
      try {
        x = reject(this.reason);
        resolveX(next, x);
      } catch (e) {
        this.reject(e);
      }
    }
    return next;
  }
};
Promise.prototype.resolve = function (value) {
  if ('rejected' === this.status) {
    throw Error('Illegal call.');
  }
  this.status = 'resolved';
  this.value = value;
  this._resolves.length && fireQ(this);
  return this;
};
Promise.prototype.reject = function (reason) {
  if ('resolved' === this.status) {
    throw Error('Illegal call. ' + reason);
  }
  this.status = 'rejected';
  this.reason = reason;
  this._rejects.length && fireQ(this);
  return this;
};

Promise.prototype.catch = function (reject) {
  return this.then(void 0, reject);
};

Promise.cast = function (arg) {
  var p = Promise();
  if (arg instanceof Promise) {
    return resolvePromise(p, arg);
  } else {
    return Promise.resolve(arg);
  }
};

Promise.resolve = function (arg) {
  var p = Promise();
  if (isThenable(arg)) {
    return resolveThen(p, arg);
  } else {
    return p.resolve(arg);
  }
};

Promise.all = function (promises) {
  var len = promises.length;
  var promise = Promise();
  var r = [];
  var pending = 0;
  var locked;

  promises.forEach(function (p, i) {
    p.then(function (v) {
      r[i] = v;
      if ((pending += 1) === len && !locked) {
        promise.resolve(r);
      }
    }, function (e) {
      locked = true;
      promise.reject(e);
    });
  });
  return promise;
};

Promise.any = function (promises) {
  var promise = Promise();
  var called;

  promises.forEach(function (p, i) {
    p.then(function (v) {
      if (!called) {
        promise.resolve(v);
        called = true;
      }
    }, function (e) {
      called = true;
      promise.reject(e);
    });
  });
  return promise;
};

Promise.reject = function (reason) {
  if (!(reason instanceof Error)) {
    throw Error('reason must be an instance of Error');
  }
  var p = Promise();
  p.reject(reason);
  return p;
};

function resolveX(promise, x) {
  if (x === promise) {
    promise.reject(new Error('TypeError'));
  }
  if (x instanceof Promise) {
    return resolvePromise(promise, x);
  } else if (isThenable(x)) {
    return resolveThen(promise, x);
  } else {
    return promise.resolve(x);
  }
}

function resolvePromise(promise1, promise2) {
  var status = promise2.status;
  if ('pending' === status) {
    promise2.then(promise1.resolve.bind(promise1), promise1.reject.bind(promise1));
  }
  if ('resolved' === status) {
    promise1.resolve(promise2.value);
  }
  if ('rejected' === status) {
    promise1.reject(promise2.reason);
  }
  return promise;
}

function resolveThen(promise, thanable) {
  var called;
  var resolve = once(function (x) {
    if (called) {
      return;
    }
    resolveX(promise, x);
    called = true;
  });
  var reject = once(function (r) {
    if (called) {
      return;
    }
    promise.reject(r);
    called = true;
  });
  try {
    thanable.then.call(thanable, resolve, reject);
  } catch (e) {
    if (!called) {
      throw e;
    } else {
      promise.reject(e);
    }
  }
  return promise;
}

function fireQ(promise) {
  var status = promise.status;
  var queue = promise['resolved' === status ? '_resolves' : '_rejects'];
  var arg = promise['resolved' === status ? 'value' : 'reason'];
  var fn;
  var x;
  while (fn = queue.shift()) {
    x = fn.call(promise, arg);
    x && resolveX(promise._next, x);
  }
  return promise;
}

function noop() {
}

function isFn(fn) {
  return 'function' === type(fn);
}

function isObj(o) {
  return 'object' === type(o);
}

function type(obj) {
  var o = {};
  return o.toString.call(obj).replace(/\[object (\w+)\]/, '$1').toLowerCase();
}

function isThenable(obj) {
  return obj && obj.then && isFn(obj.then);
}

function once(fn) {
  var called;
  var r;
  return function () {
    if (called) {
      return r;
    }
    called = true;
    return r = fn.apply(this, arguments);
  };
}

// module export
let VizabiPromise = Promise;
module.exports = {VizabiPromise};