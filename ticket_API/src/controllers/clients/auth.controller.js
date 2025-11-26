import authServices from "../../services/auth.services";

class AuthController {

  showRegister(req, res) {
    res.render('clients/auth/register', { title: 'Register' });
  }

  async register(req, res) {
    try {
      await authServices.register(req.body);

      return res.redirect('auth/login');

    } catch (error) {
      return res.render('clients/auth/register', {
         title: 'Đăng ký', 
         error: error.message }
        );
    }

  }

  showLogin(req, res) {
    res.render('clients/auth/login', { title: 'Đăng nhập' });
  }

  //xử lý đăng nhập
  async login(req, res) {
    try {
      const {token} = await authServices.login(req.body);

      //lưu token vào cookie
      res.cookie('token', token, { httpOnly: true });

      return res.redirect('/');
    } catch (error) {
      return res.render('clients/auth/login', {
        title: 'Đăng nhập',
        error: error.message
      });
    }
  }
    // Đăng xuất 
    async logout(req, res) {
      res.clearCookie('token');
      return res.redirect('/auth/login');
    }
  }

export default new AuthController();