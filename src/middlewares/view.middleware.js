// src/middlewares/view.middleware.js

export const globalViewVars = (req, res, next) => { // Có từ khóa export ở đây
  res.locals.user = req.user || null;

  console.log("Current User Role:", req.user ? req.user.role : "No user");     
  res.locals.isOrganizer = req.user?.role === 'Organizer';
  res.locals.isAdmin = req.user?.role === 'Admin';
  next();
};
