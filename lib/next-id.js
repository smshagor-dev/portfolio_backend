function toDelegateName(modelName) {
  return `${modelName.charAt(0).toLowerCase()}${modelName.slice(1)}`;
}

async function getNextIntIdForDelegate(delegate) {
  const latestRecord = await delegate.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });

  return (Number(latestRecord?.id) || 0) + 1;
}

async function getNextIntId(prismaClient, modelName) {
  return getNextIntIdForDelegate(prismaClient[toDelegateName(modelName)]);
}

module.exports = {
  getNextIntId,
  getNextIntIdForDelegate,
  toDelegateName,
};
