/**
 * Contract Controller
 * Handles: sendContract, signContract
 */

const leadService = require('../../services/leadService');
const leadEmail = require('../../services/leadEmailService');
const { catchAsync } = require('../../middleware/errorHandler');
const { sendSuccess } = require('../../utils/responseHelper');
const config = require('../../config/setting');

const DASH = config.dashboard.url;

// POST /api/leads/:id/contract
const sendContract = catchAsync(async (req, res) => {
  const { contractUrl, message, attachmentName } = req.body;
  const agentName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();

  const lead = await leadService.sendContract(
    req.params.id, req.tenantId,
    { contractUrl, message, attachmentName },
    req.user._id
  );

  leadEmail.sendContractEmail(lead, { contractUrl, message, agentName });

  return sendSuccess(res, { message: 'Contract sent' });
});

// PATCH /api/leads/:id/contract/signed
const signContract = catchAsync(async (req, res) => {
  const { note, signedDate } = req.body;
  const agentName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim();
  const reviewUrl = `${DASH}/leads/${req.params.id}`;

  const lead = await leadService.signContract(
    req.params.id, req.tenantId,
    { note, signedDate },
    req.user._id
  );

  leadEmail.sendContractSigned(lead, agentName);
  leadEmail.sendWonNotification(lead, { agentName, reviewUrl });

  return sendSuccess(res, { data: { status: 'won' }, message: 'Contract signed — lead marked as Won' });
});

module.exports = { sendContract, signContract };
