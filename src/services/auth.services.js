import User from '../models/user.models.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

class AuthService {
    static async register(data) {
        const { name, email, password, phonenumner } = data;

        const exists = await User.findOne({email});
        if (exists) throw new Error('User already exists');

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            email,
            passwordHash,
            phonenumner
        });

        return newUser;
  }

    static async login(data){
      const { email, password } = data;

      const user = await User.findOne({email});
      if(!user) throw new Error("Email hoặc mật khẩu không đúng");

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if(!isMatch) throw new Error("Email hoặc mật khẩu không đúng");

      const token = jwt.sign(
        {
          id: user._id,
          role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return { token, user };
    }
}

export default new AuthService();
