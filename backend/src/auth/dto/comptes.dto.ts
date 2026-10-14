import { IsEmail, IsString, Length } from 'class-validator';

// Politique de mot de passe : longueur > complexité (NIST 800-63B). Minimum
// 10 caractères ; 72 = limite d'octets de bcrypt — on refuse plus long plutôt
// que de laisser bcrypt tronquer en silence.
class DefinirMotDePasseBase {
  @IsString() token!: string;
  @IsString() @Length(10, 72) motDePasse!: string;
}

export class ActiverCompteDto extends DefinirMotDePasseBase {}
export class ReinitialiserMotDePasseDto extends DefinirMotDePasseBase {}

export class ChangerMotDePasseDto {
  @IsString() actuel!: string;
  @IsString() @Length(10, 72) nouveau!: string;
}

export class MotDePasseOublieDto {
  @IsEmail() email!: string;
}
