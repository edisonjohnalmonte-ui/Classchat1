"use strict";

// ==========================================
// 1. SUPABASE CONNECTION
// ==========================================

const SUPABASE_URL = "https://tdnczpdpdwanuseuykys.supabase.co";
const SUPABASE_KEY = "sb_publishable_uhW0TQd17Dwz29SRH-8xFg_u-l_c8ti";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. HTML ELEMENTS
// ==========================================

const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");
const displayName = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const who = document.getElementById("who");
const messageList = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

// ==========================================
// 3. APP STATE
// ==========================================

let currentUser = null;
let channel = null;
let chatGeneration = 0;

const names = Object.create(null);

function showAuthMessage(text) {
  authMessage.textContent = text;
}

// ==========================================
// 4. SIGN UP
// ==========================================

async function signUp() {
  const name = displayName.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (name.length < 2 || name.length > 24) {
    showAuthMessage("Display name must be 2 to 24 characters.");
    return;
  }

  if (!email || !password) {
    showAuthMessage("Enter your email and password.");
    return;
  }

  showAuthMessage("Creating your account...");
  signupBtn.disabled = true;

  try {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name }
      }
    });

    if (error) throw error;

    if (data.session) {
      showAuthMessage("Account created successfully!");
    } else {
      showAuthMessage(
        "Check your email to confirm your account, then log in."
      );
    }
  } catch (error) {
    showAuthMessage(error.message || "Signup failed.");
  } finally {
    signupBtn.disabled = false;
  }
}

// ==========================================
// 5. LOGIN AND LOGOUT
// ==========================================

async function logIn() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showAuthMessage("Enter your email and password.");
    return;
  }

  showAuthMessage("Logging in...");

  try {
    const { error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    showAuthMessage("");
  } catch (error) {
    showAuthMessage(error.message || "Login failed.");
  }
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  logIn();
});

signupBtn.addEventListener("click", (event) => {
  event.preventDefault();

  if (authForm.reportValidity()) {
    signUp();
  }
});

logoutBtn.addEventListener("click", async () => {
  logoutBtn.disabled = true;

  try {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error("Logout failed:", error);
    showAuthMessage(error.message || "Could not log out.");
  } finally {
    logoutBtn.disabled = false;
  }
});

// ==========================================
// 6. AUTHENTICATION STATE
// ==========================================

sb.auth.onAuthStateChange((event, session) => {
  const user = session?.user || null;

  setTimeout(() => {
    if (user && (!currentUser || currentUser.id !== user.id)) {
      startChat(user);
    } else if (!user && currentUser) {
      stopChat();
    } else if (!user) {
      authScreen.hidden = false;
      chatScreen.hidden = true;
    }
  }, 0);
});

async function restoreSession() {
  const { data, error } = await sb.auth.getSession();

  if (error) {
    console.error("Session error:", error);
    return;
  }

  if (data.session?.user && !currentUser) {
    await startChat(data.session.user);
  }
}

// ==========================================
// 7. START AND STOP CHAT
// ==========================================

async function startChat(user) {
  const generation = ++chatGeneration;

  currentUser = user;
  authScreen.hidden = true;
  chatScreen.hidden = false;
  who.textContent = "Loading...";
  messageList.replaceChildren();

  try {
    await loadNames();

    if (generation !== chatGeneration) return;

    who.textContent = await nameFor(user.id);

    if (generation !== chatGeneration) return;

    await loadMessages();

    if (generation !== chatGeneration) return;

    listenForNewMessages();
    messageInput.focus();
  } catch (error) {
    console.error("Could not start chat:", error);
    who.textContent = "Chat loading failed.";
  }
}

function stopChat() {
  ++chatGeneration;
  currentUser = null;

  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  messageList.replaceChildren();
  passwordInput.value = "";
  who.textContent = "";
  chatScreen.hidden = true;
  authScreen.hidden = false;
}

// ==========================================
// 8. PROFILES
// ==========================================

async function loadNames() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, display_name");

  if (error) {
    console.error("Profile loading error:", error);
    return;
  }

  for (const profile of data || []) {
    names[profile.id] = profile.display_name || "Unknown";
  }
}

async function nameFor(userId) {
  if (names[userId]) return names[userId];

  const { data, error } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Profile lookup error:", error);
  }

  names[userId] = data?.display_name || "Unknown";
  return names[userId];
}

// ==========================================
// 9. DISPLAY MESSAGES
// ==========================================

function showMessage(msg) {
  if (!currentUser || !msg) return;

  if (
    messageList.querySelector(
      '[data-id="' + String(msg.id) + '"]'
    )
  ) {
    return;
  }

  const item = document.createElement("li");
  item.className =
    msg.user_id === currentUser.id ? "message mine" : "message";

  item.dataset.id = String(msg.id);

  const author = document.createElement("span");
  author.className = "author";
  author.textContent = names[msg.user_id] || "Unknown";

  const body = document.createElement("p");
  body.textContent = msg.content;

  const time = document.createElement("time");
  const date = new Date(msg.created_at);

  time.textContent = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });

  item.append(author, body, time);
  messageList.appendChild(item);
  messageList.scrollTop = messageList.scrollHeight;
}

// ==========================================
// 10. LOAD CHAT HISTORY
// ==========================================

async function loadMessages() {
  const { data, error } = await sb
    .from("messages")
    .select("id, user_id, content, created_at")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Message loading error:", error);
    showBotMessage("Could not load chat history. Check database permissions.");
    return;
  }

  for (const msg of data || []) {
    await nameFor(msg.user_id);
    showMessage(msg);
  }
}

// ==========================================
// 11. SEND CHAT MESSAGE
// ==========================================

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) return;

  const content = messageInput.value.trim();
  if (!content) return;

  if (content.startsWith("/")) {
    messageInput.value = "";
    await handleCommand(content);
    return;
  }

  messageInput.value = "";

  const { data, error } = await sb
    .from("messages")
    .insert({ content })
    .select("id, user_id, content, created_at")
    .single();

  if (error) {
    console.error("Send message error:", error);
    alert("Could not send: " + error.message);
    messageInput.value = content;
    return;
  }

  await nameFor(data.user_id);
  showMessage(data);
  messageInput.focus();
});

// ==========================================
// 12. REALTIME CHAT
// ==========================================

function listenForNewMessages() {
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  channel = sb
    .channel("class-chat")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      async (payload) => {
        if (!currentUser) return;

        await nameFor(payload.new.user_id);
        showMessage(payload.new);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "messages"
      },
      (payload) => removeMessage(payload.old.id)
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Realtime connection issue:", status);
      }
    });
}

function removeMessage(id) {
  const item = messageList.querySelector(
    '[data-id="' + String(id) + '"]'
  );

  if (item) item.remove();
}

// ==========================================
// 13. WEATHERBOT API SETTINGS
// ==========================================

const GEO_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const WEATHER_URL =
  "https://api.open-meteo.com/v1/forecast";

// ==========================================
// 14. WEATHER DESCRIPTIONS
// ==========================================

function describeWeather(code) {
  const conditions = {
    0: "Clear sky ☀️",
    1: "Mainly clear 🌤️",
    2: "Partly cloudy ⛅",
    3: "Overcast ☁️",
    45: "Fog 🌫️",
    48: "Rime fog 🌫️",
    51: "Light drizzle 🌦️",
    53: "Moderate drizzle 🌦️",
    55: "Heavy drizzle 🌧️",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Slight rain 🌧️",
    63: "Moderate rain 🌧️",
    65: "Heavy rain 🌧️",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow ❄️",
    73: "Moderate snow ❄️",
    75: "Heavy snow ❄️",
    77: "Snow grains ❄️",
    80: "Slight rain showers 🌦️",
    81: "Moderate rain showers 🌧️",
    82: "Heavy rain showers ⛈️",
    85: "Slight snow showers ❄️",
    86: "Heavy snow showers ❄️",
    95: "Thunderstorm ⛈️",
    96: "Thunderstorm with hail ⛈️",
    99: "Severe thunderstorm with hail ⛈️"
  };

  return conditions[code] || "Unknown conditions";
}

// ==========================================
// 15. SEARCH ANY SUPPORTED CITY
// ==========================================

async function findCity(city) {
  const url =
    GEO_URL +
    "?name=" + encodeURIComponent(city) +
    "&count=10&language=en&format=json";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const result = await response.json();
  return result.results || [];
}

// ==========================================
// 16. GET CURRENT WEATHER + 7-DAY FORECAST
// ==========================================

async function getWeather(city) {
  const places = await findCity(city);

  if (places.length === 0) {
    return (
      "Location not found: " + city +
      "\nTry another city, such as Manila, Tokyo, or London."
    );
  }

  const place = places[0];

  const locationName = [
    place.name,
    place.admin1,
    place.country
  ].filter(Boolean).join(", ");

  return getWeatherByCoordinates(
    place.latitude,
    place.longitude,
    locationName
  );
}

async function getWeatherByCoordinates(
  latitude,
  longitude,
  locationName
) {
  const url =
    WEATHER_URL +
    "?latitude=" + latitude +
    "&longitude=" + longitude +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&forecast_days=7" +
    "&timezone=auto";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Weather data could not be loaded.");
  }

  const result = await response.json();
  const current = result.current;
  const daily = result.daily;

  if (!current || !daily) {
    throw new Error("Weather data is unavailable.");
  }

  const lines = [
    "🌍 WEATHER REPORT",
    "📍 Location: " + locationName,
    "🕒 Local time: " + current.time,
    "",
    "🌡️ CURRENT WEATHER",
    "Temperature: " + current.temperature_2m + "°C",
    "Feels like: " + current.apparent_temperature + "°C",
    "Condition: " + describeWeather(current.weather_code),
    "Humidity: " + current.relative_humidity_2m + "%",
    "Precipitation: " + current.precipitation + " mm",
    "Wind speed: " + current.wind_speed_10m + " km/h",
    "",
    "📅 7-DAY FORECAST"
  ];

  for (let i = 0; i < daily.time.length; i++) {
    lines.push(
      daily.time[i] +
      " | " + describeWeather(daily.weather_code[i]) +
      " | High: " + daily.temperature_2m_max[i] + "°C" +
      " | Low: " + daily.temperature_2m_min[i] + "°C" +
      " | Rain chance: " +
      (daily.precipitation_probability_max[i] ?? "N/A") + "%"
    );
  }

  lines.push("", "Weather data: Open-Meteo");

  return lines.join("\n");
}

// ==========================================
// 17. DETECT USER LOCATION WITH PERMISSION
// ==========================================

async function getMyLocationWeather() {
  if (!navigator.geolocation) {
    showBotMessage(
      "Your browser does not support location detection.\n" +
      "Try /weather Manila instead."
    );
    return;
  }

  showBotMessage("Requesting location permission...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const report = await getWeatherByCoordinates(
          position.coords.latitude,
          position.coords.longitude,
          "Your current location"
        );

        showBotMessage(report);
      } catch (error) {
        console.error("Location weather error:", error);
        showBotMessage("Could not load weather for your location.");
      }
    },
    (error) => {
      console.error("Location permission error:", error);

      showBotMessage(
        "Location access was denied or unavailable.\n" +
        "Allow browser location permission or use /weather Manila."
      );
    },
    {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000
    }
  );
}

// ==========================================
// 18. WEATHERBOT COMMAND HANDLER
// ==========================================

async function handleCommand(text) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const city = parts.slice(1).join(" ").trim();

  if (command !== "/weather") {
    showBotMessage(
      "Unknown command.\n" +
      "Try /weather Manila or /weather here."
    );
    return;
  }

  if (!city) {
    showBotMessage(
      "🌦️ WEATHERBOT HELP\n\n" +
      "/weather Manila - Current weather and forecast\n" +
      "/weather Tokyo - Search another city\n" +
      "/weather New York - Search a city with spaces\n" +
      "/weather here - Detect your location with permission"
    );
    return;
  }

  if (
    ["here", "my location", "current location"].includes(
      city.toLowerCase()
    )
  ) {
    await getMyLocationWeather();
    return;
  }

  showBotMessage("Searching weather for " + city + "...");

  try {
    const report = await getWeather(city);
    showBotMessage(report);
  } catch (error) {
    console.error("WeatherBot error:", error);

    showBotMessage(
      "Weather service is unavailable right now.\n" +
      "Check your internet connection and try again."
    );
  }
}

// ==========================================
// 19. PRIVATE WEATHERBOT REPLY
// ==========================================

function showBotMessage(text) {
  if (!currentUser) return;

  const item = document.createElement("li");
  item.className = "message bot";

  const author = document.createElement("span");
  author.className = "author";
  author.textContent = "WeatherBot · Private reply";

  const body = document.createElement("p");
  body.textContent = text;
  body.style.whiteSpace = "pre-line";
  body.style.overflowWrap = "anywhere";

  item.append(author, body);
  messageList.appendChild(item);
  messageList.scrollTop = messageList.scrollHeight;
}

// ==========================================
// 20. RESTORE EXISTING LOGIN
// ==========================================

restoreSession();