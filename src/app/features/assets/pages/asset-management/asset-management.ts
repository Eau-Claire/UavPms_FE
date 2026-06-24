import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';

@Component({
  selector: 'app-asset-management',
  imports: [NgOptimizedImage],
  templateUrl: './asset-management.html',
  styleUrl: './asset-management.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetManagement {

}
