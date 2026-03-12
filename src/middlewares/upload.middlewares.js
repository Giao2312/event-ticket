import multer from 'multer';   
import path from 'node:path';        

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
  
    cb(null, path.join(process.cwd(), 'public/events/images'));
  },
  filename: (req, file, cb) => {
  
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname); 
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (jpg, png, webp, gif)'), false);
  }
};


export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } 
});


export const uploadMultiple = upload.array('images', 10);


export const uploadSingle = upload.single('image'); 