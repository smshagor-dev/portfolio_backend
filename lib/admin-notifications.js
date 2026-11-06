const prisma = require("./prisma");

function normalizeString(value) {
  return String(value || "").trim();
}

function buildMessageActionUrl(messageId) {
  const normalizedId = Number.parseInt(messageId, 10);
  if (!normalizedId) {
    return "/admin/messages";
  }

  return `/admin/messages?messageId=${normalizedId}`;
}

function buildNotificationPreview(value) {
  const normalized = normalizeString(value).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function extractFieldFromBody(body, label) {
  const normalizedBody = String(body || "");
  if (!normalizedBody) {
    return "";
  }

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizedBody.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim?.() || "";
}

function getNotificationSubject(notification) {
  return extractFieldFromBody(notification?.body, "Subject");
}

function mapNotificationType(type) {
  return type === "NEW_MESSAGE" ? "MESSAGE" : "REPLY";
}

function buildFallbackGroupKey(email, subject) {
  return JSON.stringify({
    email: normalizeString(email).toLowerCase(),
    subject: normalizeString(subject).toLowerCase(),
  });
}

function buildNotificationGroupId(notification) {
  const normalizedConversationId = Number.parseInt(notification?.conversationId, 10);
  if (normalizedConversationId) {
    return `conversation:${normalizedConversationId}`;
  }

  const fallbackKey = buildFallbackGroupKey(
    notification?.visitorEmail,
    getNotificationSubject(notification),
  );
  return `fallback:${Buffer.from(fallbackKey, "utf8").toString("base64url")}`;
}

function parseNotificationGroupId(groupId) {
  const normalizedGroupId = normalizeString(groupId);
  if (!normalizedGroupId) {
    return null;
  }

  if (normalizedGroupId.startsWith("conversation:")) {
    const conversationId = Number.parseInt(normalizedGroupId.slice("conversation:".length), 10);
    if (!conversationId) {
      return null;
    }

    return {
      kind: "conversation",
      conversationId,
    };
  }

  if (normalizedGroupId.startsWith("fallback:")) {
    try {
      const serializedKey = Buffer.from(
        normalizedGroupId.slice("fallback:".length),
        "base64url",
      ).toString("utf8");
      const parsedKey = JSON.parse(serializedKey);
      return {
        kind: "fallback",
        email: normalizeString(parsedKey?.email).toLowerCase(),
        subject: normalizeString(parsedKey?.subject).toLowerCase(),
      };
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function matchesNotificationGroup(notification, parsedGroupId) {
  if (!notification || !parsedGroupId) {
    return false;
  }

  if (parsedGroupId.kind === "conversation") {
    const conversationId = Number.parseInt(notification.conversationId, 10);
    const messageId = Number.parseInt(notification.messageId, 10);
    return conversationId === parsedGroupId.conversationId || (!conversationId && messageId === parsedGroupId.conversationId);
  }

  if (Number.parseInt(notification.conversationId, 10)) {
    return false;
  }

  return (
    normalizeString(notification.visitorEmail).toLowerCase() === parsedGroupId.email &&
    normalizeString(getNotificationSubject(notification)).toLowerCase() === parsedGroupId.subject
  );
}

function buildNotificationTitle(type, visitorName) {
  const safeName = normalizeString(visitorName) || "Visitor";

  if (type === "NEW_MESSAGE") {
    return `You have a new message from ${safeName}`;
  }

  if (normalizeString(visitorName)) {
    return `You have a message reply from ${safeName}`;
  }

  return "You have a message reply";
}

function buildNotificationBody({
  type,
  visitorName,
  visitorEmail,
  visitorPhone,
  subject,
  preview,
}) {
  const lines = [];
  const safeName = normalizeString(visitorName);
  const safeEmail = normalizeString(visitorEmail);
  const safePhone = normalizeString(visitorPhone);
  const safeSubject = normalizeString(subject);
  const safePreview = buildNotificationPreview(preview);

  if (safeName) {
    lines.push(`Name: ${safeName}`);
  }

  if (safeEmail) {
    lines.push(`Email: ${safeEmail}`);
  }

  if (safePhone) {
    lines.push(`Phone: ${safePhone}`);
  }

  if (safeSubject) {
    lines.push(`Subject: ${safeSubject}`);
  }

  if (safePreview) {
    lines.push(type === "NEW_MESSAGE" ? `Message: ${safePreview}` : `Reply: ${safePreview}`);
  }

  return lines.join("\n");
}

function serializeAdminNotification(notification) {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body || "",
    visitorName: notification.visitorName || "",
    visitorEmail: notification.visitorEmail || "",
    visitorPhone: notification.visitorPhone || "",
    messageId: notification.messageId || null,
    conversationId: notification.conversationId || null,
    preview: notification.preview || "",
    actionUrl: notification.actionUrl || "",
    isRead: Boolean(notification.isRead),
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

function serializeAdminNotificationGroup(group) {
  if (!group) {
    return null;
  }

  return {
    groupId: group.groupId,
    type: group.type,
    senderName: group.senderName,
    email: group.email,
    subject: group.subject,
    messageCount: group.messageCount,
    unreadCount: group.unreadCount,
    latestMessagePreview: group.latestMessagePreview,
    latestCreatedAt: group.latestCreatedAt,
    conversationId: group.conversationId,
    notificationIds: group.notificationIds,
    isRead: group.unreadCount === 0,
    actionUrl: group.actionUrl,
  };
}

function groupAdminNotifications(notifications) {
  const sortedNotifications = [...(notifications || [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
  const groups = [];
  const groupMap = new Map();

  sortedNotifications.forEach((notification) => {
    const groupId = buildNotificationGroupId(notification);
    let group = groupMap.get(groupId);
    if (!group) {
      const conversationId =
        Number.parseInt(notification?.conversationId, 10) ||
        Number.parseInt(notification?.messageId, 10) ||
        null;

      group = {
        groupId,
        type: mapNotificationType(notification.type),
        senderName: normalizeString(notification.visitorName),
        email: normalizeString(notification.visitorEmail),
        subject: getNotificationSubject(notification),
        messageCount: 0,
        unreadCount: 0,
        latestMessagePreview: normalizeString(notification.preview),
        latestCreatedAt: notification.createdAt,
        conversationId,
        notificationIds: [],
        actionUrl: normalizeString(notification.actionUrl) || buildMessageActionUrl(conversationId),
      };
      groups.push(group);
      groupMap.set(groupId, group);
    }

    group.messageCount += 1;
    if (!notification.isRead) {
      group.unreadCount += 1;
    }
    group.notificationIds.push(notification.id);
  });

  return groups.sort((left, right) => new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime());
}

async function fetchAdminNotificationGroupCandidates(groupId) {
  const parsedGroupId = parseNotificationGroupId(groupId);
  if (!parsedGroupId) {
    return [];
  }

  if (parsedGroupId.kind === "conversation") {
    return prisma.adminNotification.findMany({
      where: {
        OR: [
          { conversationId: parsedGroupId.conversationId },
          { conversationId: null, messageId: parsedGroupId.conversationId },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const emailFilter = parsedGroupId.email || undefined;
  return prisma.adminNotification.findMany({
    where: {
      conversationId: null,
      ...(emailFilter ? { visitorEmail: emailFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getAdminNotificationGroupById(groupId) {
  const candidates = await fetchAdminNotificationGroupCandidates(groupId);
  return (
    groupAdminNotifications(candidates)
      .map(serializeAdminNotificationGroup)
      .find((group) => group.groupId === groupId) || null
  );
}

async function getAdminNotificationGroupByNotification(notificationOrId) {
  const notification =
    typeof notificationOrId === "string"
      ? await prisma.adminNotification.findUnique({ where: { id: notificationOrId } })
      : notificationOrId;

  if (!notification?.id) {
    return null;
  }

  return getAdminNotificationGroupById(buildNotificationGroupId(notification));
}

async function listAdminNotificationGroups({ page = 1, limit = 12 } = {}) {
  const notifications = await prisma.adminNotification.findMany({
    orderBy: { createdAt: "desc" },
  });
  const groups = groupAdminNotifications(notifications).map(serializeAdminNotificationGroup);
  const skip = Math.max(0, (page - 1) * limit);

  return {
    notifications: groups.slice(skip, skip + limit),
    total: groups.length,
  };
}

async function countUnreadAdminNotificationGroups() {
  const notifications = await prisma.adminNotification.findMany({
    where: { isRead: false },
    orderBy: { createdAt: "desc" },
  });

  return groupAdminNotifications(notifications).length;
}

async function markAdminNotificationGroupRead(groupId) {
  const group = await getAdminNotificationGroupById(groupId);
  if (!group) {
    return null;
  }

  if (group.notificationIds.length > 0) {
    await prisma.adminNotification.updateMany({
      where: {
        id: { in: group.notificationIds },
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  return getAdminNotificationGroupById(groupId);
}

async function deleteAdminNotificationGroup(groupId) {
  const group = await getAdminNotificationGroupById(groupId);
  if (!group) {
    return null;
  }

  if (group.notificationIds.length > 0) {
    await prisma.adminNotification.deleteMany({
      where: {
        id: { in: group.notificationIds },
      },
    });
  }

  return group;
}

async function createAdminNotification({
  type,
  visitorName,
  visitorEmail,
  visitorPhone,
  messageId,
  conversationId,
  subject,
  preview,
  actionUrl,
}) {
  const normalizedMessageId = Number.parseInt(messageId, 10) || null;
  const normalizedConversationId = Number.parseInt(conversationId, 10) || normalizedMessageId;
  const normalizedPreview = buildNotificationPreview(preview);
  const notification = await prisma.adminNotification.create({
    data: {
      type,
      title: buildNotificationTitle(type, visitorName),
      body: buildNotificationBody({
        type,
        visitorName,
        visitorEmail,
        visitorPhone,
        subject,
        preview: normalizedPreview,
      }),
      visitorName: normalizeString(visitorName) || null,
      visitorEmail: normalizeString(visitorEmail) || null,
      visitorPhone: normalizeString(visitorPhone) || null,
      messageId: normalizedMessageId,
      conversationId: normalizedConversationId,
      preview: normalizedPreview || null,
      actionUrl: normalizeString(actionUrl) || buildMessageActionUrl(normalizedMessageId),
      isRead: false,
    },
  });

  return serializeAdminNotification(notification);
}

async function emitAdminNotification(io, eventName, notification) {
  if (!io || !eventName || !notification) {
    return;
  }

  const group = await getAdminNotificationGroupByNotification(notification);
  if (!group) {
    return;
  }

  io.emit(eventName, {
    type: group.type,
    title: group.subject || group.senderName || "New notification",
    notification: group,
  });
}

module.exports = {
  buildMessageActionUrl,
  buildNotificationGroupId,
  countUnreadAdminNotificationGroups,
  createAdminNotification,
  deleteAdminNotificationGroup,
  emitAdminNotification,
  getAdminNotificationGroupById,
  getAdminNotificationGroupByNotification,
  groupAdminNotifications,
  listAdminNotificationGroups,
  markAdminNotificationGroupRead,
  matchesNotificationGroup,
  parseNotificationGroupId,
  serializeAdminNotification,
  serializeAdminNotificationGroup,
};
