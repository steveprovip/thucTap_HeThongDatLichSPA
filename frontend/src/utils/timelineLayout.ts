import { timeToMinutes } from './format';

export interface OverlapItem {
  startTime: string;
  totalDurationMinutes: number;
}

export interface PositionedItem<T extends OverlapItem> {
  item: T;
  startMinutes: number;
  endMinutes: number;
  laneIndex: number;
  totalLanes: number;
}

/**
 * Thuật toán chia làn tự động (Overlap Lane Packing) cho các lịch hẹn trên dòng thời gian:
 * Khi có các lịch hẹn trùng giờ trong cùng một cột thợ, thuật toán chia làn để các thẻ
 * không bao giờ đè lên nhau, giữ nguyên tính trực quan và khả năng thao tác kéo thả.
 */
export function packOverlappingAppointments<T extends OverlapItem>(
  appointments: T[],
): PositionedItem<T>[] {
  if (!appointments || appointments.length === 0) return [];

  const itemsWithTimes = appointments.map((item) => {
    const startMinutes = timeToMinutes(item.startTime);
    const endMinutes = startMinutes + Math.max(15, item.totalDurationMinutes);
    return {
      item,
      startMinutes,
      endMinutes,
      laneIndex: 0,
      totalLanes: 1,
    };
  });

  // Sắp xếp theo giờ bắt đầu tăng dần, nếu bằng nhau thì giờ kết thúc giảm dần (lịch dài đứng trước)
  const sorted = [...itemsWithTimes].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes,
  );

  // Nhóm các khoảng thời gian giao nhau thành từng cụm (clusters)
  const clusters: typeof sorted[] = [];
  let currentCluster: typeof sorted = [];
  let clusterMaxEnd = -1;

  for (const it of sorted) {
    if (currentCluster.length === 0 || it.startMinutes < clusterMaxEnd) {
      currentCluster.push(it);
      clusterMaxEnd = Math.max(clusterMaxEnd, it.endMinutes);
    } else {
      clusters.push(currentCluster);
      currentCluster = [it];
      clusterMaxEnd = it.endMinutes;
    }
  }
  if (currentCluster.length > 0) clusters.push(currentCluster);

  const result: PositionedItem<T>[] = [];

  for (const cluster of clusters) {
    const laneEndTimes: number[] = [];
    for (const it of cluster) {
      let assignedLane = laneEndTimes.findIndex((end) => end <= it.startMinutes);
      if (assignedLane === -1) {
        assignedLane = laneEndTimes.length;
        laneEndTimes.push(it.endMinutes);
      } else {
        laneEndTimes[assignedLane] = it.endMinutes;
      }
      it.laneIndex = assignedLane;
    }
    const totalLanes = Math.max(1, laneEndTimes.length);
    for (const it of cluster) {
      it.totalLanes = totalLanes;
      result.push(it);
    }
  }

  return result;
}
