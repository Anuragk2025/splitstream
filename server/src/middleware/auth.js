import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'splitstream-jwt-secret-key-12345';

export const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required. Please login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id: userId, email: email, name: name }
    next();
  } catch (error) {
    // Clear cookie if token is invalid or expired
    res.clearCookie('token');
    return res.status(401).json({ message: 'Session expired. Please login again.' });
  }
};
