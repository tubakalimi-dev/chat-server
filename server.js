const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Dummy check
  if (email && password) {
    res.json({
      success: true,
      message: 'Login successful ',
      userId: '12345',
      email: email
    });
  } else {
    res.status(400).json({ success: false, message: 'Email or password missing' });
  }
});

module.exports = router;

