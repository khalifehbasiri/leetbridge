const { once } = require("node:events");

async function connectCDP(url) {
    const socket = new WebSocket(url);
    await once(socket, "open");
    let sequence = 0;
    const pending = new Map();
    const listeners = new Set();
    socket.addEventListener("message", ({ data }) => {
        const message = JSON.parse(data);
        if (message.method) {
            for (const listener of listeners) listener(message);
        }
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
    });
    return {
        onEvent(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        call(method, params = {}, sessionId) {
            return new Promise((resolve, reject) => {
                const id = ++sequence;
                const timer = setTimeout(() => {
                    pending.delete(id);
                    reject(new Error(`CDP timeout: ${method}`));
                }, 120000);
                pending.set(id, { resolve, reject, timer });
                socket.send(JSON.stringify({ id, method, params, sessionId }));
            });
        },
        close: () => socket.close()
    };
}

async function evaluate(cdp, sessionId, expression) {
    const response = await cdp.call("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true, userGesture: true
    }, sessionId);
    if (response.exceptionDetails) {
        // Do not echo the expression: it may contain test authentication data.
        throw new Error(response.exceptionDetails.exception?.description
            ?? response.exceptionDetails.text);
    }
    return response.result.value;
}

module.exports = { connectCDP, evaluate };
