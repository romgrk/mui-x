import * as React from 'react';
import { MuiRenderResult } from '@mui/monorepo/test/utils/createRenderer';

export interface DescribePickerOptions {
  fieldType: 'single-input' | 'multi-input';
  variant: 'mobile' | 'desktop' | 'static';
  hasNoView?: boolean;
  render: (node: React.ReactElement) => MuiRenderResult;
}
