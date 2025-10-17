const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  // Dummy login response
  res.json({ success: true, message: 'Login success', userId: '12345' });
});

module.exports = router;

