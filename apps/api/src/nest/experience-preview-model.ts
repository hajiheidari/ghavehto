export interface OwnerExperience {
  experienceId:string;cafeId:string;title:string|null;active:boolean;version:number;
  branchId:string|null;branchName:string|null;startsAt:string;endsAt:string;
  firstRecordedVisitOnly:boolean;perMemberLimit:number;remainingStock:number;remainingBudgetUnits:string;
}
export interface OwnerExperiencePage {items:OwnerExperience[];nextCursor:string|null;}
