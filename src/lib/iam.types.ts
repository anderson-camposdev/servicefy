export type UserRole =
  | 'sysadmin'
  | 'company_admin'
  | 'agent'
  | 'ops_manager'
  | 'governance_manager'
  | 'technician'
  | 'area_manager'
  | 'it_manager'
  | 'client_manager'
  | 'cio'
  | 'end_user';

export interface InviteUserPayload {
  email: string;
  name: string;
  role: UserRole;
  department_id?: string | null;
}

export interface BatchInvitePayload {
  company_id: string;
  invites: InviteUserPayload[];
}
