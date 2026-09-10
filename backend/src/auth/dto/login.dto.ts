import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  motDePasse: string;

  // Slug de la société sur laquelle l'utilisateur clique dans le portail
  @IsString()
  @IsNotEmpty()
  societeSlug: string;
}
