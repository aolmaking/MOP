export interface LoginDto {
  loginIdentifier?: string;
  workshopCode?: string;
  password?: string;
}

export interface CustomerRegisterDto {
  workshopCode: string;
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  branchId?: string;
  communicationConsent?: boolean;
}

export interface AcceptInvitationDto {
  token: string;
  password: string;
}
