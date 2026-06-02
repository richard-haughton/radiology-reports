const firebaseConfig = {
  apiKey: "AIzaSyBEDnwbmXDxktlCoYR88ShxRlp2abzw490",
  authDomain: "reports-eadf8.firebaseapp.com",
  projectId: "reports-eadf8",
  storageBucket: "reports-eadf8.firebasestorage.app",
  messagingSenderId: "78116950355",
  appId: "1:78116950355:web:8d96492b62ce812b5c51a6"
};

firebase.initializeApp(firebaseConfig);

var appAuth = firebase.auth();
var appDb = firebase.firestore();