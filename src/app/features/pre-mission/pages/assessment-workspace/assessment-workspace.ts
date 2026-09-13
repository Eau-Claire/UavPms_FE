import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PreMissionApi } from '../../data-access/pre-mission-api';
import { PreMissionAssessment } from '../../../../models/pre-mission.models';
import { statusLabel, statusTone } from '../../../../shared/status/status';
@Component({selector:'app-assessment-workspace',imports:[RouterLink,DatePipe],templateUrl:'./assessment-workspace.html',styleUrl:'./assessment-workspace.scss',changeDetection:ChangeDetectionStrategy.OnPush})
export class AssessmentWorkspace { private readonly api=inject(PreMissionApi); private readonly route=inject(ActivatedRoute); protected readonly item=signal<PreMissionAssessment|null>(null); protected readonly error=signal(''); protected readonly busy=signal(false); protected readonly statusTone=statusTone; protected readonly statusLabel=statusLabel; constructor(){const id=this.route.snapshot.paramMap.get('id');if(id)this.api.get(id).subscribe({next:x=>this.item.set(x),error:()=>this.error.set('Assessment không tồn tại hoặc bạn không có quyền truy cập.')});} protected reevaluate(){const x=this.item();if(!x||this.busy())return;this.busy.set(true);this.api.reEvaluate(x.id).subscribe({next:y=>this.item.set(y),error:()=>this.error.set('Không thể re-evaluate assessment.'),complete:()=>this.busy.set(false)});}}
