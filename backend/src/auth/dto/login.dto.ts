import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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

// Étapes de double authentification : le jeton d'étape rendu par le login.
export class EtapeDoubleFacteurDto {
  @IsString()
  @IsNotEmpty()
  jeton: string;
}

export class CodeDoubleFacteurDto extends EtapeDoubleFacteurDto {
  // 6 chiffres de l'application, ou un code de secours « XXXX-XXXX ».
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}

// Activation depuis le HUB (personne connectée) : le code de l'application.
export class CodeApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}
