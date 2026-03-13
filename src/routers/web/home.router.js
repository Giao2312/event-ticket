import express from "express";
import homeController  from "../../controllers/home.controller.js";

const app = express();
const router = express.Router();

router.get("/", homeController.index);
app.get('/', async (req, res) => {
  const Event = (await import('./src/models/event.models.js')).default;
  const events = await Event.find().sort({ date: 1 }).limit(10).lean();

  console.log('Render trang chủ với user:', req.user ? req.user.name : 'null');

  res.render('clients/page/home/index', {
    pageTitle: 'Trang chủ - EventVé',
    events: events,
    user: req.user || null  // ← BẮT BUỘC PHẢI CÓ DÒNG NÀY
  });
  
});
export default router;

