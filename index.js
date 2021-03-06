const Api = {
  async register(email, password) {
    const response = await window.fetch("http://localhost:8080/register", {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    const body = response.json();
    return body || {};
  },

  async publish(email, password, channel, data) {
    const response = await window.fetch("http://localhost:8080/publish", {
      method: "post",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        channel,
        data: JSON.stringify(data)
      })
    });
    const body = response.json();
    return body || {};
  }
};

function $(id) {
  return document.getElementById(id);
}

class Chat {
  #centrifuge = null;
  #channels = {};
  #isAlice = false;

  constructor() {
    this.#centrifuge = new Centrifuge(
      "ws://localhost:9000/connection/websocket",
      {
        subscribeEndpoint: "http://localhost:8080/subscribe"
      }
    );
    this.#centrifuge.on("connect", function(ctx) {
      console.log("connected", ctx);
    });

    this.#centrifuge.on("disconnect", function(ctx) {
      console.log("disconnected", ctx);
    });
  }

  setIsAlice(isAlice) {
    this.#isAlice = isAlice;
  }

  init(token) {
    this.#centrifuge.setToken(token);
    this.#centrifuge.connect();
  }

  publish(channel, data) {
    this.#channels[channel].publish(data);
  }

  subscribe(channel = "channel") {
    const currentUser = this.#isAlice;
    const callbacks = {
      publish: function(ctx) {
        // See below description of message format
        console.log({ ctx });

        const { value, isAlice } = ctx.data;
        switch (value) {
          case "start_typing":
            // Only show the typing message to the other user.
            if (isAlice === currentUser) return;
            $("typing").innerHTML = "typing...";
            return;
          case "end_typing":
            $("typing").innerHTML = "";
            return;
          default:
            const $div = document.createElement("div");
            $div.classList.add(isAlice === currentUser ? "right" : "left");
            $div.innerHTML = `<span>${value}</span>`;
            $("chat").appendChild($div);
            // Clear input.
            $("message").value = "";
            document.title = value;
        }
      },
      join: function(message) {
        // See below description of join message format
        console.log("join", message);
      },
      leave: function(message) {
        // See below description of leave message format
        console.log("leave", message);
      },
      subscribe: function(context) {
        // See below description of subscribe callback context format
        console.log("subscribe", context);
      },
      error: function(errContext) {
        // See below description of subscribe error callback context format
        console.log("error", errContext);
      },
      unsubscribe: function(context) {
        // See below description of unsubscribe event callback context format
        console.log("unsubscribe", context);
      }
    };
    // If the user is already subscribe to the channel, remove the old
    // subscription and all listeners.
    if (this.#channels[channel]) {
      this.#centrifuge.unsubscribe();
      this.#centrifuge.removeAllListeners();
    }
    this.#channels[channel] = this.#centrifuge.subscribe(channel, callbacks);
  }
}

async function main() {
  let isAlice = false;
  const $john = $("john");
  const $alice = $("alice");
  const $message = $("message");
  const $submit = $("submit");
  const $container = $("chat");
  const $who = $("who");
  const db = {
    alice: {
      email: "alice@mail.com",
      password: "12345678"
    },
    john: {
      email: "john.doe@mail.com",
      password: "12345678"
    },
    // NOTE: The ordering 1,2 and 2,1 is not the same.
    // Also, channel names are limited to 255 characters.
    // 1 and 2 refers to the user id 1 and 2.
    channel: "$chat:#1,2"
  };

  const chat = new Chat();

  $john.addEventListener(
    "click",
    async function() {
      $alice.remove();
      $john.remove();
      $("who").innerText = "Logging in as John";
      isAlice = false;
      chat.setIsAlice(isAlice);
      $message.disabled = false;
      $submit.disabled = false;

      const { email, password } = db.john;
      const { accessToken } = await Api.register(email, password);
      chat.init(accessToken);
      chat.subscribe(db.channel);
    },
    false
  );

  $alice.addEventListener(
    "click",
    async function() {
      $alice.remove();
      $john.remove();
      $("who").innerText = "Logging in as Alice";
      isAlice = true;
      chat.setIsAlice(isAlice);
      $message.disabled = false;
      $submit.disabled = false;

      const { email, password } = db.alice;
      const { accessToken } = await Api.register(email, password);
      chat.init(accessToken);
      chat.subscribe(db.channel);
    },
    false
  );

  let timeout = null;
  let isTyping = false;
  $message.addEventListener("keyup", function() {
    if (!isTyping) {
      isTyping = true;
      // Only if the user is on the current chat.
      const { email, password } = isAlice ? db.alice : db.john;
      Api.publish(email, password, db.channel, {
        value: "start_typing",
        isAlice
      });
    }
    timeout && window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      isTyping = false;

      const { email, password } = isAlice ? db.alice : db.john;
      Api.publish(email, password, db.channel, {
        value: "end_typing",
        isAlice
      });
    }, 500);
  });

  $submit.addEventListener(
    "click",
    function() {
      const { email, password } = isAlice ? db.alice : db.john;

      timeout && window.clearTimeout(timeout);
      Api.publish(email, password, db.channel, {
        value: message.value,
        isAlice
      });
    },
    false
  );
}

main().catch(console.error);
