// Copy this file to a real environment config for your standalone Firebase project.
// Replace all values before deploying.
// Note: AI generation now uses a user-provided OpenAI key in the browser,
// so no aiProxyUrl is required in this config.

const firebaseConfig = {
  apiKey: "AIzaSyCJp8al4zUdTYgAQFtSK9NqIcrusrObM9k",
  authDomain: "reports-f4b1a.firebaseapp.com",
  projectId: "reports-f4b1a",
  storageBucket: "reports-f4b1a.firebasestorage.app",
  messagingSenderId: "1023974104919",
  appId: "1:1023974104919:web:e38fd1c5b0b77d67a4a812"
};

firebase.initializeApp(firebaseConfig);

var appAuth = firebase.auth();
var appDb = firebase.firestore();
