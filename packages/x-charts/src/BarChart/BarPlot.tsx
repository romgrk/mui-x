import * as React from 'react';
import PropTypes from 'prop-types';
import { useTransition } from '@react-spring/web';
import { SeriesContext } from '../context/SeriesContextProvider';
import { CartesianContext } from '../context/CartesianContextProvider';
import { BarElement, BarElementProps, BarElementSlotProps, BarElementSlots } from './BarElement';
import { AxisDefaultized, isBandScaleConfig, isPointScaleConfig } from '../models/axis';
import { FormatterResult } from '../models/seriesType/config';
import { BarItemIdentifier } from '../models';
import { DEFAULT_X_AXIS_KEY, DEFAULT_Y_AXIS_KEY } from '../constants';
import getColor from './getColor';
import { useChartId } from '../hooks';
import { AnimationData, CompletedBarData, MaskData } from './types';
import { BarClipPath } from './BarClipPath';

/**
 * Solution of the equations
 * W = barWidth * N + offset * (N-1)
 * offset / (offset + barWidth) = r
 * @param bandWidth The width available to place bars.
 * @param numberOfGroups The number of bars to place in that space.
 * @param gapRatio The ratio of the gap between bars over the bar width.
 * @returns The bar width and the offset between bars.
 */
function getBandSize({
  bandWidth: W,
  numberOfGroups: N,
  gapRatio: r,
}: {
  bandWidth: number;
  numberOfGroups: number;
  gapRatio: number;
}) {
  if (r === 0) {
    return {
      barWidth: W / N,
      offset: 0,
    };
  }
  const barWidth = W / (N + (N - 1) * r);
  const offset = r * barWidth;
  return {
    barWidth,
    offset,
  };
}

export interface BarPlotSlots extends BarElementSlots {}

export interface BarPlotSlotProps extends BarElementSlotProps {}

export interface BarPlotProps extends Pick<BarElementProps, 'slots' | 'slotProps'> {
  /**
   * If `true`, animations are skipped.
   * @default false
   */
  skipAnimation?: boolean;
  /**
   * Callback fired when a bar item is clicked.
   * @param {React.MouseEvent<SVGElement, MouseEvent>} event The event source of the callback.
   * @param {BarItemIdentifier} barItemIdentifier The bar item identifier.
   */
  onItemClick?: (
    event: React.MouseEvent<SVGElement, MouseEvent>,
    barItemIdentifier: BarItemIdentifier,
  ) => void;
  /**
   * Defines the border radius of the bar element.
   */
  borderRadius?: number;
}

const useAggregatedData = (): {
  completedData: CompletedBarData[];
  masksData: MaskData[];
} => {
  const seriesData =
    React.useContext(SeriesContext).bar ??
    ({ series: {}, stackingGroups: [], seriesOrder: [] } as FormatterResult<'bar'>);
  const axisData = React.useContext(CartesianContext);
  const chartId = useChartId();

  const { series, stackingGroups } = seriesData;
  const { xAxis, yAxis, xAxisIds, yAxisIds } = axisData;
  const defaultXAxisId = xAxisIds[0];
  const defaultYAxisId = yAxisIds[0];

  const masks: Record<string, MaskData> = {};

  const data = stackingGroups.flatMap(({ ids: groupIds }, groupIndex) => {
    return groupIds.flatMap((seriesId) => {
      const xAxisKey = series[seriesId].xAxisKey ?? defaultXAxisId;
      const yAxisKey = series[seriesId].yAxisKey ?? defaultYAxisId;

      const xAxisConfig = xAxis[xAxisKey];
      const yAxisConfig = yAxis[yAxisKey];

      const verticalLayout = series[seriesId].layout === 'vertical';
      let baseScaleConfig: AxisDefaultized<'band'>;

      if (verticalLayout) {
        if (!isBandScaleConfig(xAxisConfig)) {
          throw new Error(
            `MUI X Charts: ${
              xAxisKey === DEFAULT_X_AXIS_KEY
                ? 'The first `xAxis`'
                : `The x-axis with id "${xAxisKey}"`
            } should be of type "band" to display the bar series of id "${seriesId}".`,
          );
        }
        if (xAxis[xAxisKey].data === undefined) {
          throw new Error(
            `MUI X Charts: ${
              xAxisKey === DEFAULT_X_AXIS_KEY
                ? 'The first `xAxis`'
                : `The x-axis with id "${xAxisKey}"`
            } should have data property.`,
          );
        }
        baseScaleConfig = xAxisConfig as AxisDefaultized<'band'>;
        if (isBandScaleConfig(yAxisConfig) || isPointScaleConfig(yAxisConfig)) {
          throw new Error(
            `MUI X Charts: ${
              yAxisKey === DEFAULT_Y_AXIS_KEY
                ? 'The first `yAxis`'
                : `The y-axis with id "${yAxisKey}"`
            } should be a continuous type to display the bar series of id "${seriesId}".`,
          );
        }
      } else {
        if (!isBandScaleConfig(yAxisConfig)) {
          throw new Error(
            `MUI X Charts: ${
              yAxisKey === DEFAULT_Y_AXIS_KEY
                ? 'The first `yAxis`'
                : `The y-axis with id "${yAxisKey}"`
            } should be of type "band" to display the bar series of id "${seriesId}".`,
          );
        }

        if (yAxis[yAxisKey].data === undefined) {
          throw new Error(
            `MUI X Charts: ${
              yAxisKey === DEFAULT_Y_AXIS_KEY
                ? 'The first `yAxis`'
                : `The y-axis with id "${yAxisKey}"`
            } should have data property.`,
          );
        }
        baseScaleConfig = yAxisConfig as AxisDefaultized<'band'>;
        if (isBandScaleConfig(xAxisConfig) || isPointScaleConfig(xAxisConfig)) {
          throw new Error(
            `MUI X Charts: ${
              xAxisKey === DEFAULT_X_AXIS_KEY
                ? 'The first `xAxis`'
                : `The x-axis with id "${xAxisKey}"`
            } should be a continuous type to display the bar series of id "${seriesId}".`,
          );
        }
      }

      const xScale = xAxisConfig.scale;
      const yScale = yAxisConfig.scale;

      const colorGetter = getColor(series[seriesId], xAxis[xAxisKey], yAxis[yAxisKey]);
      const bandWidth = baseScaleConfig.scale.bandwidth();

      const { barWidth, offset } = getBandSize({
        bandWidth,
        numberOfGroups: stackingGroups.length,
        gapRatio: baseScaleConfig.barGapRatio,
      });
      const barOffset = groupIndex * (barWidth + offset);

      const { stackedData } = series[seriesId];

      return stackedData.map((values, dataIndex: number) => {
        const valueCoordinates = values.map((v) => (verticalLayout ? yScale(v)! : xScale(v)!));

        const minValueCoord = Math.round(Math.min(...valueCoordinates));
        const maxValueCoord = Math.round(Math.max(...valueCoordinates));

        const stackId = series[seriesId].stack;

        const result = {
          seriesId,
          dataIndex,
          layout: series[seriesId].layout,
          x: verticalLayout
            ? xScale(xAxis[xAxisKey].data?.[dataIndex])! + barOffset
            : minValueCoord,
          y: verticalLayout
            ? minValueCoord
            : yScale(yAxis[yAxisKey].data?.[dataIndex])! + barOffset,
          xOrigin: xScale(0)!,
          yOrigin: yScale(0)!,
          height: verticalLayout ? maxValueCoord - minValueCoord : barWidth,
          width: verticalLayout ? barWidth : maxValueCoord - minValueCoord,
          color: colorGetter(dataIndex),
          highlightScope: series[seriesId].highlightScope,
          value: series[seriesId].data[dataIndex],
          maskId: `${chartId}_${stackId || seriesId}_${groupIndex}_${dataIndex}`,
        };

        if (!masks[result.maskId]) {
          masks[result.maskId] = {
            id: result.maskId,
            width: 0,
            height: 0,
            hasNegative: false,
            hasPositive: false,
            layout: result.layout,
            xOrigin: xScale(0)!,
            yOrigin: yScale(0)!,
            x: 0,
            y: 0,
          };
        }

        const mask = masks[result.maskId];
        mask.width = result.layout === 'vertical' ? result.width : mask.width + result.width;
        mask.height = result.layout === 'vertical' ? mask.height + result.height : result.height;
        mask.x = Math.min(mask.x === 0 ? Infinity : mask.x, result.x);
        mask.y = Math.min(mask.y === 0 ? Infinity : mask.y, result.y);
        mask.hasNegative = mask.hasNegative || (result.value ?? 0) < 0;
        mask.hasPositive = mask.hasPositive || (result.value ?? 0) > 0;

        return result;
      });
    });
  });

  return {
    completedData: data,
    masksData: Object.values(masks),
  };
};

const leaveStyle = ({ layout, yOrigin, x, width, y, xOrigin, height }: AnimationData) => ({
  ...(layout === 'vertical'
    ? {
        y: yOrigin,
        x,
        height: 0,
        width,
      }
    : {
        y,
        x: xOrigin,
        height,
        width: 0,
      }),
});

const enterStyle = ({ x, width, y, height }: AnimationData) => ({
  y,
  x,
  height,
  width,
});

/**
 * Demos:
 *
 * - [Bars](https://mui.com/x/react-charts/bars/)
 * - [Bar demonstration](https://mui.com/x/react-charts/bar-demo/)
 * - [Stacking](https://mui.com/x/react-charts/stacking/)
 *
 * API:
 *
 * - [BarPlot API](https://mui.com/x/api/charts/bar-plot/)
 */
function BarPlot(props: BarPlotProps) {
  const { completedData, masksData } = useAggregatedData();
  const { skipAnimation, onItemClick, borderRadius, ...other } = props;
  const transition = useTransition(completedData, {
    keys: (bar) => `${bar.seriesId}-${bar.dataIndex}`,
    from: leaveStyle,
    leave: leaveStyle,
    enter: enterStyle,
    update: enterStyle,
    immediate: skipAnimation,
  });

  const maskTransition = useTransition(masksData, {
    keys: (v) => v.id,
    from: leaveStyle,
    leave: leaveStyle,
    enter: enterStyle,
    update: enterStyle,
    immediate: skipAnimation,
  });

  return (
    <React.Fragment>
      {maskTransition((style, { id, hasPositive, hasNegative, layout }) => {
        return (
          <BarClipPath
            maskId={id}
            borderRadius={borderRadius}
            hasNegative={hasNegative}
            hasPositive={hasPositive}
            layout={layout}
            style={style}
          />
        );
      })}
      {transition((style, { seriesId, dataIndex, color, highlightScope, maskId }) => {
        const barElement = (
          <BarElement
            id={seriesId}
            dataIndex={dataIndex}
            color={color}
            highlightScope={highlightScope}
            {...other}
            onClick={
              onItemClick &&
              ((event) => {
                onItemClick(event, { type: 'bar', seriesId, dataIndex });
              })
            }
            style={style}
          />
        );

        if (!borderRadius || borderRadius <= 0) {
          return barElement;
        }

        return <g clipPath={`url(#${maskId})`}>{barElement}</g>;
      })}
    </React.Fragment>
  );
}

BarPlot.propTypes = {
  // ----------------------------- Warning --------------------------------
  // | These PropTypes are generated from the TypeScript type definitions |
  // | To update them edit the TypeScript types and run "pnpm proptypes"  |
  // ----------------------------------------------------------------------
  /**
   * Defines the border radius of the bar element.
   */
  borderRadius: PropTypes.number,
  /**
   * Callback fired when a bar item is clicked.
   * @param {React.MouseEvent<SVGElement, MouseEvent>} event The event source of the callback.
   * @param {BarItemIdentifier} barItemIdentifier The bar item identifier.
   */
  onItemClick: PropTypes.func,
  /**
   * If `true`, animations are skipped.
   * @default false
   */
  skipAnimation: PropTypes.bool,
  /**
   * The props used for each component slot.
   * @default {}
   */
  slotProps: PropTypes.object,
  /**
   * Overridable component slots.
   * @default {}
   */
  slots: PropTypes.object,
} as any;

export { BarPlot };
