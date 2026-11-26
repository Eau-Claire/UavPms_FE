import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ActiveLearningGateway } from './active-learning-gateway';
import { DEFAULT_ACTIVE_LEARNING_CONFIG } from './active-learning.config';

describe('DEFAULT_ACTIVE_LEARNING_CONFIG (FE-REQ-003 Option 2A)', () => {
  it('keeps Active Learning disabled by default in operational UI', () => {
    expect(DEFAULT_ACTIVE_LEARNING_CONFIG.enabled).toBe(false);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const gateway = TestBed.inject(ActiveLearningGateway);
    expect(gateway.enabled).toBe(false);
    expect(gateway.statusFor({ id: 'a1', mediaUrl: '', labelStatus: 'FullyReviewed' })).toBeNull();
  });
});
