const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const requireSession = require('../middleware/requireSession');

router.get ('/auth/profiles', authController.listProfiles);
router.post('/auth/register', authController.register);
router.post('/auth/login',    authController.login);
router.get ('/auth/session',  authController.getSession);
router.post('/auth/logout',   authController.logout);

router.get('/protected', requireSession, authController.protectedRoute);

module.exports = router;
