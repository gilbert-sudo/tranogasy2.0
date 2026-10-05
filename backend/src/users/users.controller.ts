import { Controller, Get, Post, Body, Param, Res, HttpStatus, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { UsersService } from './users.service';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('exist/:phone')
  async checkExistence(@Param('phone') phone: string, @Res() res: Response) {
    const exists = await this.usersService.checkExistence(phone);
    if (exists) {
      // Return 200 OK if exists, which triggers the frontend error 'Déjà utilisé'
      return res.status(HttpStatus.OK).json({ exists: true });
    }
    // Return 404 Not Found if it does not exist, so frontend proceeds with signup
    return res.status(HttpStatus.NOT_FOUND).json({ exists: false });
  }

  @Post('login')
  async login(@Body() body: any) {
    const { phone, password } = body;
    if (!phone || !password) {
      throw new BadRequestException('Phone and password are required');
    }
    return this.usersService.login(phone, password);
  }

  @Post()
  async signup(@Body() body: any) {
    return this.usersService.signup(body);
  }
}
