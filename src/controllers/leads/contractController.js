/**
 * Contract Controller
 * Handles: sendContract, signContract
 */
import * as leadService from '../../services/leadService.js';
import { catchAsync } from '../../middleware/errorHandler.js';
import { sendSuccess } from '../../utils/responseHelper.js';

// POST /api/leads/:id/contract
export const sendContract = catchAsync(async (req, res) => {
  const { contractUrl, message, attachmentName } = req.body;
  const agentName = req.user.name || req.user.email;
  await leadService.sendContract(req.params.id, req.tenantId, { contractUrl, message, attachmentName }, req.user.id, agentName);
  return sendSuccess(res, { message: 'Contract sent' });
});

// PATCH /api/leads/:id/contract/signed
export const signContract = catchAsync(async (req, res) => {
  const { note, signedDate } = req.body;
  const agentName = req.user.name || req.user.email;
  await leadService.signContract(req.params.id, req.tenantId, { note, signedDate }, req.user.id, agentName);
  return sendSuccess(res, { data: { status: 'won' }, message: 'Contract signed — lead marked as Won' });
});
