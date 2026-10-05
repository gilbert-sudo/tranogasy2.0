import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async checkExistence(phone: string): Promise<boolean> {
    const user = await this.userModel.findOne({ phone }).exec();
    return !!user;
  }

  async login(phone: string, passwordToTest: string): Promise<any> {
    const user = await this.userModel.findOne({ phone }).exec();
    if (!user || !user.password) {
      throw new UnauthorizedException('Ce numéro ne possède pas de compte.');
    }

    const match = await bcrypt.compare(passwordToTest, user.password);
    if (!match) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }

    // Remove password from response
    const userObj = user.toObject();
    delete userObj.password;

    return {
      message: 'Connexion réussie',
      user: userObj
    };
  }

  async signup(createUserDto: any): Promise<any> {
    const { phone } = createUserDto;
    
    // Validate if exists
    const exists = await this.checkExistence(phone);
    if (exists) {
      throw new BadRequestException('Ce numéro de téléphone est déjà utilisé');
    }

    // Hash the password with bcrypt (salt rounds = 5 based on old app)
    const salt = await bcrypt.genSalt(5);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    const createdUser = new this.userModel({
      ...createUserDto,
      password: hashedPassword,
      lastConnectedAt: new Date()
    });
    
    const user = await createdUser.save();
    
    const userObj = user.toObject();
    delete userObj.password;

    return {
      message: 'Compte créé avec succès',
      user: userObj
    };
  }
}
