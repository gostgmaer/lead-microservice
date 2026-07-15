import * as leadService from '../../services/leadService.js';
import { catchAsync } from '../../middleware/errorHandler.js';
import { sendSuccess } from '../../utils/responseHelper.js';

// PATCH /internal/staff/:iamUserId/deactivate — called by IAM's user-archive cascade
export const deactivateStaff = catchAsync(async (req, res) => {
  const { iamUserId } = req.params;
  const result = await leadService.unassignLeadsForStaff(iamUserId);
  return sendSuccess(res, { data: result, message: 'Staff leads unassigned' });
});
